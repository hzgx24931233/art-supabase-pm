<template>
  <ArtDialog ref="dialogRef">
    <ArtAsyncState
      :loading="templatesLoading"
      :error="templatesError"
      :empty="!templatesLoading && !templatesError && !templates.length"
      empty-title="暂无可用 WBS 模板"
      empty-description="请先在“模板管理”中新建并启用模板，再回到草稿版本套用。"
      @retry="loadTemplates"
    >
      <div class="wbs-template-apply">
        <ArtForm
          ref="formRef"
          v-model="form"
          :items="formItems"
          :span="24"
          label-position="top"
          :show-reset="false"
          :show-submit="false"
        />

        <ElAlert
          type="info"
          :closable="false"
          show-icon
          title="套用说明"
          description="模板节点会追加到当前草稿版本，不会覆盖已有节点；如果当前草稿已存在相同 WBS 编码，系统会提示先调整编码或新建草稿版本。"
        />

        <section v-if="form.templateId" class="wbs-template-apply__preview">
          <header class="wbs-template-apply__preview-header">
            <div>
              <strong>模板明细预览</strong>
              <small v-if="selectedTemplate">
                {{ selectedTemplate.name }} · {{ nodes.length }} 个节点 ·
                {{ milestoneCount }} 个里程碑
              </small>
            </div>
            <ElTag v-if="selectedTemplate && !selectedTemplate.enabled" type="info" effect="light">
              已停用
            </ElTag>
          </header>

          <ArtAsyncState
            :loading="nodesLoading"
            :error="nodesError"
            :empty="!nodesLoading && !nodesError && !nodes.length"
            empty-title="该模板暂无明细"
            empty-description="请先在“模板管理”中为该模板添加节点。"
            @retry="reloadNodes"
          >
            <ElScrollbar max-height="320px">
              <ElTree
                :data="templateTree"
                node-key="id"
                default-expand-all
                :expand-on-click-node="false"
                class="wbs-template-apply__tree"
              >
                <template #default="{ data }">
                  <div class="wbs-template-apply__node">
                    <span class="wbs-template-apply__code">{{ data.wbs_code }}</span>
                    <span class="wbs-template-apply__name" :title="data.name">{{ data.name }}</span>
                    <ElTag v-if="data.is_milestone" size="small" type="warning" effect="light">
                      里程碑
                    </ElTag>
                  </div>
                </template>
              </ElTree>
            </ElScrollbar>
          </ArtAsyncState>
        </section>
      </div>
    </ArtAsyncState>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { computed, reactive, ref, watch } from 'vue'
  import { ElAlert, ElMessage, ElScrollbar, ElTag, ElTree } from 'element-plus'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import { listWbsTemplateNodes, copyWbsTemplate, listWbsTemplates, toWbsError } from '@pm/api/wbs'
  import type { WbsTemplate, WbsTemplateNode } from '@pm/types/wbs'
  import { buildWbsTree } from '../wbs-model'

  export interface WbsTemplateApplyOpenData {
    projectId: string
    versionId: string
    versionLabel: string
  }

  interface WbsTemplateApplyForm {
    templateId: string
  }

  const emit = defineEmits<{ success: [] }>()

  interface WbsTemplateApplyDialogExpose {
    handleOpen: (data: WbsTemplateApplyOpenData) => Promise<void>
  }

  const dialogRef = ref<ArtDialogExpose<WbsTemplateApplyOpenData>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const form = reactive<WbsTemplateApplyForm>({ templateId: '' })
  const templates = ref<WbsTemplate[]>([])
  const nodes = ref<WbsTemplateNode[]>([])
  const templatesLoading = ref(false)
  const nodesLoading = ref(false)
  const templatesError = ref<Error | null>(null)
  const nodesError = ref<Error | null>(null)
  let openData: WbsTemplateApplyOpenData | null = null
  let loadedTemplateId = ''

  const templateOptions = computed(() =>
    templates.value.map((template) => ({
      label: `${template.name} · ${template.category}（${template.node_count} 个节点）`,
      value: template.id
    }))
  )
  const formItems = computed<FormItem[]>(() => [
    {
      label: '选择模板',
      key: 'templateId',
      type: 'select',
      span: 24,
      options: templateOptions.value,
      props: { placeholder: '请选择要套用的 WBS 模板' }
    }
  ])
  const selectedTemplate = computed(
    () => templates.value.find((template) => template.id === form.templateId) ?? null
  )
  const templateTree = computed(() => buildWbsTree(nodes.value))
  const milestoneCount = computed(() => nodes.value.filter((node) => node.is_milestone).length)

  const loadNodes = async (templateId: string, force = false): Promise<void> => {
    if (!templateId || (!force && templateId === loadedTemplateId)) return
    nodesLoading.value = true
    nodesError.value = null
    try {
      nodes.value = await listWbsTemplateNodes(templateId)
      loadedTemplateId = templateId
    } catch (error) {
      loadedTemplateId = ''
      nodesError.value = toWbsError(error)
    } finally {
      nodesLoading.value = false
    }
  }

  const reloadNodes = (): Promise<void> => loadNodes(form.templateId, true)

  const loadTemplates = async (): Promise<void> => {
    templatesLoading.value = true
    templatesError.value = null
    loadedTemplateId = ''
    try {
      templates.value = await listWbsTemplates()
      form.templateId = templates.value[0]?.id ?? ''
    } catch (error) {
      templatesError.value = toWbsError(error)
    } finally {
      templatesLoading.value = false
    }
  }

  watch(
    () => form.templateId,
    (templateId) => {
      if (templateId) void loadNodes(templateId)
    }
  )

  const handleOpen = async (data: WbsTemplateApplyOpenData): Promise<void> => {
    openData = data
    form.templateId = ''
    templates.value = []
    nodes.value = []
    templatesError.value = null
    nodesError.value = null
    await dialogRef.value?.handleOpen(data, {
      title: '套用 WBS 模板',
      subtitle: `将模板明细追加到当前草稿版本 ${data.versionLabel}`,
      titleIcon: 'ri:file-copy-line',
      size: 'lg',
      contentMaxHeight: '68vh',
      confirmText: '套用模板',
      dialogProps: { appendToBody: true, closeOnClickModal: false },
      onOpen: loadTemplates,
      onConfirm: async () => {
        if (!openData) return false
        if (!form.templateId) {
          ElMessage.warning('请选择要套用的 WBS 模板')
          return false
        }
        if (!nodes.value.length) {
          ElMessage.warning('当前模板没有明细节点，请先在模板管理中维护')
          return false
        }
        await copyWbsTemplate(openData.projectId, openData.versionId, form.templateId)
        emit('success')
        return true
      }
    })
  }

  defineExpose<WbsTemplateApplyDialogExpose>({ handleOpen })
</script>

<style scoped lang="scss">
  .wbs-template-apply {
    display: grid;
    gap: var(--art-space-3);
    min-width: 0;
  }

  .wbs-template-apply__preview {
    display: grid;
    gap: var(--art-space-2);
    min-width: 0;
    padding-top: var(--art-space-3);
    border-top: 1px solid var(--el-border-color-lighter);
  }

  .wbs-template-apply__preview-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--art-space-3);

    > div {
      display: grid;
      gap: 2px;
      min-width: 0;
    }

    strong {
      color: var(--el-text-color-primary);
    }

    small {
      color: var(--el-text-color-secondary);
    }
  }

  .wbs-template-apply__tree {
    padding: var(--art-space-2);
    border: 1px solid var(--el-border-color-lighter);
    border-radius: var(--el-border-radius-base);
  }

  .wbs-template-apply__node {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-width: 0;
  }

  .wbs-template-apply__code {
    color: var(--theme-color);
    font-size: 12px;
  }

  .wbs-template-apply__name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
