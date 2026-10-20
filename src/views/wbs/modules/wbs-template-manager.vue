<template>
  <ArtDrawer ref="drawerRef" :show-footer="false">
    <div class="wbs-template-manager">
      <aside class="wbs-template-manager__list">
        <header class="wbs-template-manager__list-header">
          <div>
            <strong>模板列表</strong>
            <small>选择模板后维护明细</small>
          </div>
          <ElButton
            v-auth="'PmWbs:ManageTemplate'"
            size="small"
            type="primary"
            plain
            @click="startNewTemplate"
          >
            新建模板
          </ElButton>
        </header>

        <ArtAsyncState
          :loading="manager.templatesLoading"
          :error="manager.templatesError"
          :empty="
            !manager.templatesLoading &&
            !manager.templatesError &&
            !manager.templates.length &&
            !manager.isNew
          "
          empty-title="暂无 WBS 模板"
          empty-description="点击“新建模板”开始维护模板明细。"
          @retry="loadTemplates()"
        >
          <ElScrollbar class="wbs-template-manager__list-scroll">
            <div class="wbs-template-manager__items">
              <div v-if="manager.isNew" class="wbs-template-manager__item is-active">
                <span>
                  <strong>新模板</strong>
                  <small>尚未保存</small>
                </span>
                <ElTag size="small" type="warning" effect="light">未保存</ElTag>
              </div>
              <button
                v-for="template in manager.templates"
                :key="template.id"
                type="button"
                class="wbs-template-manager__item"
                :class="{
                  'is-active': !manager.isNew && manager.selectedId === template.id
                }"
                :aria-pressed="!manager.isNew && manager.selectedId === template.id"
                @click="selectTemplate(template)"
              >
                <span>
                  <strong :title="template.name">{{ template.name }}</strong>
                  <small>{{ template.category }} · {{ template.node_count }} 个节点</small>
                </span>
                <ElTag v-if="!template.enabled" size="small" type="info" effect="light">
                  停用
                </ElTag>
              </button>
            </div>
          </ElScrollbar>
        </ArtAsyncState>
      </aside>

      <section class="wbs-template-manager__detail">
        <ArtAsyncState v-if="detailLoading" loading loading-mode="skeleton" :skeleton-rows="6" />
        <template v-else-if="hasEditableTemplate">
          <header class="wbs-template-manager__detail-header">
            <div>
              <strong>
                {{ manager.isNew ? '新建 WBS 模板' : manager.header.name || '模板详情' }}
              </strong>
              <small>
                {{
                  manager.isNew
                    ? '填写模板信息并添加明细后保存。'
                    : '维护模板信息与明细，保存后可在 WBS 草稿中套用。'
                }}
              </small>
            </div>
            <div class="wbs-template-manager__detail-actions">
              <ElTag v-if="manager.dirty" type="warning" effect="light">有未保存修改</ElTag>
              <ElButton
                v-auth="'PmWbs:ManageTemplate'"
                type="danger"
                plain
                :disabled="manager.isNew"
                @click="deleteTemplate"
              >
                删除模板
              </ElButton>
              <ElButton
                v-auth="'PmWbs:ManageTemplate'"
                type="primary"
                :loading="manager.saving"
                @click="saveTemplate"
              >
                保存模板
              </ElButton>
            </div>
          </header>

          <ElScrollbar class="wbs-template-manager__detail-scroll">
            <div class="wbs-template-manager__detail-body">
              <ArtForm
                ref="headerFormRef"
                v-model="manager.header"
                :items="headerFormItems"
                :rules="headerRules"
                :span="24"
                label-position="top"
                :show-reset="false"
                :show-submit="false"
              />

              <section class="wbs-template-manager__nodes">
                <header class="wbs-template-manager__nodes-header">
                  <div>
                    <strong>模板明细</strong>
                    <small>{{ manager.nodes.length }} 个节点，可拖拽调整层级和顺序</small>
                  </div>
                  <ElButton
                    v-auth="'PmWbs:ManageTemplate'"
                    size="small"
                    :disabled="manager.nodesLoading"
                    @click="addNode(null)"
                  >
                    新增根节点
                  </ElButton>
                </header>

                <ArtAsyncState
                  :loading="manager.nodesLoading"
                  :error="manager.nodesError"
                  :empty="!manager.nodesLoading && !manager.nodesError && !manager.nodes.length"
                  empty-title="暂无模板明细"
                  empty-description="新增根节点后即可维护模板结构、编码和里程碑。"
                  @retry="reloadNodes"
                >
                  <ElTree
                    ref="treeRef"
                    :data="manager.treeData"
                    node-key="id"
                    draggable
                    default-expand-all
                    :expand-on-click-node="false"
                    highlight-current
                    :current-node-key="manager.currentNodeId || undefined"
                    :allow-drop="allowDrop"
                    :allow-drag="allowDrag"
                    class="wbs-template-manager__tree"
                    @node-click="(data) => viewNode(data)"
                    @node-drop="handleTreeDrop"
                  >
                    <template #default="{ data }">
                      <div class="wbs-template-manager__node">
                        <span class="wbs-template-manager__node-icon" aria-hidden="true">
                          <ArtSvgIcon icon="ri:folder-3-line" />
                        </span>
                        <span class="wbs-template-manager__node-code">{{ data.wbs_code }}</span>
                        <span class="wbs-template-manager__node-name" :title="data.name">
                          {{ data.name }}
                        </span>
                        <ElTag v-if="data.is_milestone" size="small" type="warning" effect="light">
                          里程碑
                        </ElTag>
                        <span class="wbs-template-manager__node-actions">
                          <ArtIconButton
                            v-auth="'PmWbs:ManageTemplate'"
                            icon="ri:add-line"
                            label="新增下级节点"
                            @click.stop="addNode(data.id)"
                          />
                          <ArtIconButton
                            icon="ri:eye-line"
                            label="查看节点"
                            @click.stop="viewNode(data)"
                          />
                          <ArtIconButton
                            v-auth="'PmWbs:ManageTemplate'"
                            icon="ri:edit-line"
                            label="编辑节点"
                            @click.stop="editNode(data)"
                          />
                          <ArtIconButton
                            v-auth="'PmWbs:ManageTemplate'"
                            icon="ri:delete-bin-line"
                            label="删除节点"
                            tone="danger"
                            @click.stop="removeNode(data)"
                          />
                        </span>
                      </div>
                    </template>
                  </ElTree>
                </ArtAsyncState>
              </section>
            </div>
          </ElScrollbar>
        </template>

        <ArtEmptyState
          v-else-if="!manager.templatesLoading"
          size="compact"
          :title="manager.templates.length ? '选择一个 WBS 模板' : '暂无 WBS 模板'"
          :description="
            manager.templates.length
              ? '从左侧选择模板，或新建一个模板后维护明细。'
              : '点击左侧“新建模板”开始维护模板明细。'
          "
        />
      </section>
    </div>

    <WbsTemplateNodeDialog ref="nodeDialogRef" :on-submit="saveNodeFromDialog" />
    <MasterDataDeleteGuard ref="deleteGuardRef" />
  </ArtDrawer>
</template>

<script setup lang="ts">
  import { computed, nextTick, reactive, ref, watch } from 'vue'
  import type { FormRules, TreeInstance, TreeNodeData } from 'element-plus'
  import { ElButton, ElMessage, ElScrollbar, ElTag, ElTree } from 'element-plus'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import MasterDataDeleteGuard, {
    type MasterDataDeleteGuardOpenOptions
  } from '@/components/business/master-data-delete-guard/index.vue'
  import { formatReferenceStatus } from '@/components/business/master-data-delete-guard/record-meta'
  import { fetchRecordDeleteDependencies } from '@/api/master-data-delete'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { normalizeNullableText, normalizeNonNullableText } from '@/utils/form/normalize'
  import {
    deleteWbsTemplate,
    listWbsTemplateNodes,
    listWbsTemplates,
    saveWbsTemplate,
    toWbsError
  } from '@pm/api/wbs'
  import type {
    WbsTemplate,
    WbsTemplateHeaderInput,
    WbsTemplateNode,
    WbsTemplateNodeInput
  } from '@pm/types/wbs'
  import {
    buildWbsTree,
    collectWbsSubtreeIds,
    hasWbsCycle,
    nextWbsCode,
    type WbsTreeNode
  } from '../wbs-model'
  import WbsTemplateNodeDialog, {
    type WbsTemplateNodeDialogOpenData
  } from './wbs-template-node-dialog.vue'

  interface TemplateManagerState {
    templates: WbsTemplate[]
    selectedId: string
    isNew: boolean
    currentNodeId: string
    header: WbsTemplateHeaderInput
    nodes: WbsTemplateNode[]
    treeData: WbsTreeNode<WbsTemplateNode>[]
    templatesLoading: boolean
    nodesLoading: boolean
    saving: boolean
    templatesError: Error | null
    nodesError: Error | null
    dirty: boolean
  }

  interface DeleteGuardExpose {
    inspect: (options: MasterDataDeleteGuardOpenOptions) => Promise<boolean>
  }

  interface WbsTemplateNodeDialogExpose {
    handleOpen: (data: WbsTemplateNodeDialogOpenData) => Promise<void>
  }

  interface WbsTemplateManagerExpose {
    handleOpen: () => Promise<void>
  }

  const createHeader = (): WbsTemplateHeaderInput => ({
    id: null,
    name: '',
    category: '',
    description: null,
    enabled: true
  })

  const createEmptyNode = (): WbsTemplateNode => ({
    id: '',
    template_id: '',
    parent_id: null,
    sort_order: 0,
    wbs_code: '',
    name: '',
    description: null,
    deliverable_summary: null,
    unit: null,
    quality_standard: null,
    is_milestone: false,
    metadata: {}
  })

  const drawerRef = ref<ArtDrawerExpose<Record<string, never>>>()
  const headerFormRef = ref<InstanceType<typeof ArtForm>>()
  const nodeDialogRef = ref<WbsTemplateNodeDialogExpose>()
  const deleteGuardRef = ref<DeleteGuardExpose>()
  const treeRef = ref<TreeInstance>()
  const { confirmAction, confirmDelete } = useArtFeedback()

  const manager = reactive<TemplateManagerState>({
    templates: [],
    selectedId: '',
    isNew: false,
    currentNodeId: '',
    header: createHeader(),
    nodes: [],
    treeData: [],
    templatesLoading: false,
    nodesLoading: false,
    saving: false,
    templatesError: null,
    nodesError: null,
    dirty: false
  })

  const headerFormItems: FormItem[] = [
    {
      label: '模板名称',
      key: 'name',
      type: 'input',
      span: 12,
      props: { maxlength: 120, placeholder: '例如：弱电标准 WBS' }
    },
    {
      label: '模板分类',
      key: 'category',
      type: 'input',
      span: 12,
      props: { maxlength: 60, placeholder: '例如：弱电、房建' }
    },
    {
      label: '模板说明',
      key: 'description',
      type: 'textarea',
      span: 24,
      props: { rows: 2, maxlength: 500, placeholder: '说明模板适用的项目类型和范围' }
    },
    {
      label: '启用模板',
      key: 'enabled',
      type: 'switch',
      span: 12,
      props: { activeText: '启用', inactiveText: '停用' }
    }
  ]

  const headerRules: FormRules<WbsTemplateHeaderInput> = {
    name: [{ required: true, message: '请输入模板名称', trigger: 'blur' }],
    category: [{ required: true, message: '请输入模板分类', trigger: 'blur' }]
  }

  const hasEditableTemplate = computed(() => manager.isNew || Boolean(manager.selectedId))
  const detailLoading = computed(
    () => manager.templatesLoading && !manager.isNew && !manager.selectedId
  )

  let suppressDirty = false

  watch(
    () => manager.header,
    () => {
      if (!suppressDirty) manager.dirty = true
    },
    { deep: true }
  )

  const setHeader = (header: WbsTemplateHeaderInput): void => {
    suppressDirty = true
    Object.assign(manager.header, createHeader(), header)
    void nextTick(() => {
      suppressDirty = false
    })
  }

  const refreshTree = (): void => {
    manager.treeData = buildWbsTree(manager.nodes)
  }

  const markPristine = async (): Promise<void> => {
    manager.dirty = false
    await nextTick()
    drawerRef.value?.markPristine()
  }

  const upsertTemplate = (template: WbsTemplate): void => {
    const index = manager.templates.findIndex((item) => item.id === template.id)
    if (index >= 0) manager.templates[index] = template
    else manager.templates.push(template)
    manager.templates.sort(
      (a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)
    )
  }

  const selectTemplateById = async (templateId: string): Promise<void> => {
    const template = manager.templates.find((item) => item.id === templateId)
    if (!template) return
    manager.isNew = false
    manager.selectedId = template.id
    manager.currentNodeId = ''
    manager.nodesLoading = true
    manager.nodesError = null
    setHeader({
      id: template.id,
      name: template.name,
      category: template.category,
      description: template.description,
      enabled: template.enabled
    })
    try {
      manager.nodes = await listWbsTemplateNodes(template.id)
      refreshTree()
    } catch (error) {
      manager.nodes = []
      manager.treeData = []
      manager.nodesError = toWbsError(error)
    } finally {
      manager.nodesLoading = false
      await markPristine()
    }
  }

  const loadTemplates = async (preferredId?: string): Promise<void> => {
    manager.templatesLoading = true
    manager.templatesError = null
    try {
      manager.templates = await listWbsTemplates({ includeDisabled: true })
      const targetId =
        (preferredId && manager.templates.some((item) => item.id === preferredId) && preferredId) ||
        (manager.selectedId &&
          manager.templates.some((item) => item.id === manager.selectedId) &&
          manager.selectedId) ||
        manager.templates[0]?.id ||
        ''
      if (targetId) {
        await selectTemplateById(targetId)
      } else {
        manager.isNew = false
        manager.selectedId = ''
        manager.currentNodeId = ''
        manager.nodes = []
        manager.treeData = []
        setHeader(createHeader())
        await markPristine()
      }
    } catch (error) {
      manager.templatesError = toWbsError(error)
    } finally {
      manager.templatesLoading = false
    }
  }

  const reloadNodes = async (): Promise<void> => {
    if (manager.selectedId) await selectTemplateById(manager.selectedId)
  }

  const confirmDiscard = async (message: string): Promise<boolean> => {
    if (!manager.dirty) return true
    try {
      await confirmAction(message, '未保存修改', {
        type: 'warning',
        confirmButtonText: '放弃修改'
      })
      return true
    } catch {
      return false
    }
  }

  const selectTemplate = async (template: WbsTemplate): Promise<void> => {
    if (!manager.isNew && template.id === manager.selectedId) return
    if (!(await confirmDiscard('切换模板将丢失当前未保存的修改，是否继续？'))) return
    await selectTemplateById(template.id)
  }

  const startNewTemplate = async (): Promise<void> => {
    if (!(await confirmDiscard('新建模板将丢失当前未保存的修改，是否继续？'))) return
    manager.isNew = true
    manager.selectedId = ''
    manager.currentNodeId = ''
    manager.nodes = []
    manager.treeData = []
    manager.nodesError = null
    setHeader(createHeader())
    await markPristine()
  }

  const toNodeInput = (node: WbsTemplateNode): WbsTemplateNodeInput => ({
    id: node.id,
    parent_id: node.parent_id,
    sort_order: node.sort_order,
    wbs_code: normalizeNonNullableText(node.wbs_code),
    name: normalizeNonNullableText(node.name),
    description: normalizeNullableText(node.description),
    deliverable_summary: normalizeNullableText(node.deliverable_summary),
    unit: normalizeNullableText(node.unit),
    quality_standard: normalizeNullableText(node.quality_standard),
    is_milestone: node.is_milestone,
    metadata: node.metadata ?? {}
  })

  const validateNodes = (): boolean => {
    const codes = new Set<string>()
    for (const node of manager.nodes) {
      const code = normalizeNonNullableText(node.wbs_code)
      const name = normalizeNonNullableText(node.name)
      if (!code || !name) {
        ElMessage.warning('请完整填写模板节点的 WBS 编码和工作名称')
        return false
      }
      if (codes.has(code)) {
        ElMessage.warning(`WBS 编码“${code}”重复，请调整后再保存`)
        return false
      }
      codes.add(code)
      if (node.parent_id && !manager.nodes.some((item) => item.id === node.parent_id)) {
        ElMessage.warning('模板节点存在无效的上级节点')
        return false
      }
      if (hasWbsCycle(manager.nodes, node.id, node.parent_id)) {
        ElMessage.warning('模板节点层级存在循环，请调整后再保存')
        return false
      }
    }
    return true
  }

  const saveTemplate = async (): Promise<boolean> => {
    if (manager.saving) return false
    try {
      await headerFormRef.value?.validate()
    } catch {
      return false
    }
    if (!validateNodes()) return false

    manager.saving = true
    try {
      const result = await saveWbsTemplate({
        template: {
          id: manager.isNew ? null : manager.selectedId || null,
          name: normalizeNonNullableText(manager.header.name),
          category: normalizeNonNullableText(manager.header.category),
          description: normalizeNullableText(manager.header.description),
          enabled: manager.header.enabled
        },
        nodes: manager.nodes.map(toNodeInput)
      })
      manager.isNew = false
      manager.selectedId = result.template.id
      setHeader({
        id: result.template.id,
        name: result.template.name,
        category: result.template.category,
        description: result.template.description,
        enabled: result.template.enabled
      })
      manager.nodes = result.nodes
      refreshTree()
      upsertTemplate(result.template)
      await markPristine()
      return true
    } catch {
      return false
    } finally {
      manager.saving = false
    }
  }

  const inspectTemplateReferences = async (template: WbsTemplate): Promise<boolean> => {
    const blocked = await deleteGuardRef.value?.inspect({
      resourceLabel: 'WBS 模板',
      resources: [{ id: template.id, label: template.name }],
      navigationResource: { type: 'pm_wbs_template', queryKey: 'referencedRecordId' },
      fetchDependencies: async () => {
        const rows = await fetchRecordDeleteDependencies({
          table: 'pm_wbs_template',
          ids: [template.id]
        })
        return rows
          .filter((row) => row.sourceTable !== 'pm_wbs_template_node')
          .map((row) => ({
            resourceId: row.resourceId,
            recordId: row.recordId,
            targetId: row.targetId,
            recordNo: row.recordNo,
            recordSummary: row.recordSummary,
            recordStatus: formatReferenceStatus(row.recordStatus),
            recordAmount: row.recordAmount,
            createdAt: row.createdAt ?? '',
            dependencyCode: row.sourceTable,
            cleanupAllowed: false
          }))
      }
    })
    return blocked ?? true
  }

  const deleteTemplate = async (): Promise<void> => {
    if (manager.isNew) {
      if (!(await confirmDiscard('放弃当前未保存的新模板吗？'))) return
      await loadTemplates()
      return
    }
    const template = manager.templates.find((item) => item.id === manager.selectedId)
    if (!template) return
    try {
      if (await inspectTemplateReferences(template)) return
      await confirmDelete(
        `删除模板“${template.name}”后不可恢复；已套用到历史 WBS 版本的节点不会受影响。确认删除吗？`
      )
    } catch {
      return
    }
    try {
      await deleteWbsTemplate(template.id)
      await markPristine()
      await loadTemplates()
    } catch {
      // API 层负责展示失败原因。
    }
  }

  const createNodeDraft = (parentId: string | null): WbsTemplateNode => ({
    ...createEmptyNode(),
    id: crypto.randomUUID(),
    template_id: manager.selectedId,
    parent_id: parentId,
    sort_order: manager.nodes.filter((item) => item.parent_id === parentId).length,
    wbs_code: nextWbsCode(manager.nodes, parentId)
  })

  const addNode = (parentId: string | null): void => {
    manager.currentNodeId = ''
    void nodeDialogRef.value?.handleOpen({ mode: 'create', node: createNodeDraft(parentId) })
  }

  const findNode = (node: WbsTemplateNode): WbsTemplateNode =>
    manager.nodes.find((item) => item.id === node.id) ?? node

  const viewNode = (node: WbsTemplateNode): void => {
    manager.currentNodeId = node.id
    void nodeDialogRef.value?.handleOpen({ mode: 'view', node: { ...findNode(node) } })
  }

  const editNode = (node: WbsTemplateNode): void => {
    manager.currentNodeId = node.id
    void nodeDialogRef.value?.handleOpen({ mode: 'edit', node: { ...findNode(node) } })
  }

  const saveNodeFromDialog = async (node: WbsTemplateNode): Promise<boolean> => {
    const existing = manager.nodes.find((item) => item.id === node.id)
    if (existing) Object.assign(existing, node)
    else manager.nodes.push(node)
    manager.currentNodeId = node.id
    manager.dirty = true
    refreshTree()
    return true
  }

  const removeNode = async (node: WbsTemplateNode): Promise<void> => {
    const ids = collectWbsSubtreeIds(manager.nodes, node.id)
    try {
      await confirmDelete(
        ids.size > 1
          ? `确定删除“${node.name}”及其 ${ids.size - 1} 个下级节点吗？`
          : `确定删除“${node.name}”吗？`
      )
    } catch {
      return
    }
    manager.nodes = manager.nodes.filter((item) => !ids.has(item.id))
    if (ids.has(manager.currentNodeId)) manager.currentNodeId = ''
    manager.dirty = true
    refreshTree()
  }

  const allowDrag = (): boolean => true

  const allowDrop = (draggingNode: TreeNodeData, dropNode: TreeNodeData, type: string): boolean => {
    const dragging = draggingNode as WbsTreeNode<WbsTemplateNode>
    const target = dropNode as WbsTreeNode<WbsTemplateNode>
    if (dragging.id === target.id) return false
    const nextParentId = type === 'inner' ? target.id : target.parent_id
    if (nextParentId && collectWbsSubtreeIds(manager.nodes, dragging.id).has(nextParentId)) {
      return false
    }
    return true
  }

  const syncTreeOrder = (items: WbsTreeNode<WbsTemplateNode>[], parentId: string | null): void => {
    items.forEach((item, index) => {
      const target = manager.nodes.find((node) => node.id === item.id)
      if (target) {
        target.parent_id = parentId
        target.sort_order = index
      }
      syncTreeOrder(item.children, item.id)
    })
  }

  const handleTreeDrop = async (): Promise<void> => {
    await nextTick()
    syncTreeOrder(manager.treeData, null)
    manager.dirty = true
  }

  const handleOpen = async (): Promise<void> => {
    await drawerRef.value?.handleOpen(
      {},
      {
        title: 'WBS 模板管理',
        subtitle: '维护可复用模板及其工作分解明细，保存后可在 WBS 草稿中套用。',
        size: 'xl',
        contentHeight: '72vh',
        showFooter: false,
        confirmOnClose: true,
        isDirty: () => manager.dirty,
        onConfirm: saveTemplate,
        drawerProps: { class: 'wbs-template-manager-drawer', closeOnClickModal: false },
        onOpen: async () => {
          await loadTemplates()
        }
      }
    )
  }

  defineExpose<WbsTemplateManagerExpose>({ handleOpen })
</script>

<style scoped lang="scss">
  :global(
    .wbs-template-manager-drawer .art-drawer__scrollbar > .el-scrollbar__wrap > .el-scrollbar__view
  ) {
    height: 100%;
  }

  :global(.wbs-template-manager-drawer .art-drawer__content) {
    height: 100%;
  }

  .wbs-template-manager {
    display: grid;
    grid-template-columns: 270px minmax(0, 1fr);
    gap: var(--art-space-4);
    height: 100%;
    min-height: 0;
  }

  .wbs-template-manager__list {
    display: flex;
    flex-direction: column;
    gap: var(--art-space-2);
    min-width: 0;
    min-height: 0;
    padding-right: var(--art-space-4);
    border-right: 1px solid var(--el-border-color-lighter);
  }

  .wbs-template-manager__list-header {
    display: flex;
    flex: 0 0 auto;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--art-space-2);
    padding-bottom: var(--art-space-2);

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
      font-size: 12px;
    }
  }

  .wbs-template-manager__list-scroll {
    flex: 1;
    min-height: 0;
  }

  .wbs-template-manager__items {
    display: grid;
    gap: 6px;
    padding: 2px;
  }

  .wbs-template-manager__item {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--art-space-2);
    align-items: center;
    width: 100%;
    min-width: 0;
    padding: 10px 12px;
    color: inherit;
    text-align: left;
    cursor: pointer;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--el-border-radius-base);
    transition:
      background-color var(--art-motion-duration-fast),
      border-color var(--art-motion-duration-fast),
      box-shadow var(--art-motion-duration-fast);

    > span {
      display: grid;
      gap: 2px;
      min-width: 0;
    }

    strong {
      overflow: hidden;
      color: var(--el-text-color-primary);
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    small {
      color: var(--el-text-color-secondary);
      font-size: 12px;
    }

    &:hover {
      background: var(--art-gray-100);
    }

    &:focus-visible {
      outline: 2px solid var(--theme-color);
      outline-offset: 2px;
    }

    &.is-active {
      background: color-mix(in srgb, var(--theme-color) 8%, var(--default-box-color));
      border-color: color-mix(in srgb, var(--theme-color) 22%, transparent);
      box-shadow: inset 3px 0 0 var(--theme-color);
    }
  }

  .wbs-template-manager__detail {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }

  .wbs-template-manager__detail-header {
    display: flex;
    flex: 0 0 auto;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--art-space-3);
    padding-bottom: var(--art-space-3);
    border-bottom: 1px solid var(--el-border-color-lighter);

    > div:first-child {
      display: grid;
      gap: 3px;
      min-width: 0;
    }

    strong {
      color: var(--el-text-color-primary);
    }

    small {
      color: var(--el-text-color-secondary);
      font-size: 12px;
    }
  }

  .wbs-template-manager__detail-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--art-space-2);
  }

  .wbs-template-manager__detail-scroll {
    flex: 1;
    min-height: 0;
  }

  .wbs-template-manager__detail-body {
    display: grid;
    gap: var(--art-space-4);
    padding-top: var(--art-space-3);
  }

  .wbs-template-manager__nodes {
    display: grid;
    gap: var(--art-space-2);
    min-width: 0;
  }

  .wbs-template-manager__nodes-header {
    display: flex;
    flex-wrap: wrap;
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
      font-size: 12px;
    }
  }

  .wbs-template-manager__tree {
    padding: var(--art-space-2);
    border: 1px solid var(--el-border-color-lighter);
    border-radius: var(--el-border-radius-base);

    :deep(.el-tree-node__content) {
      height: auto;
      min-height: 36px;
    }
  }

  .wbs-template-manager__node {
    position: relative;
    display: grid;
    grid-template-columns: 16px auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 6px;
    width: 100%;
    min-width: 0;
    padding-right: 4px;
  }

  .wbs-template-manager__node-icon {
    display: grid;
    place-items: center;
    color: var(--el-text-color-secondary);
  }

  .wbs-template-manager__node-code {
    color: var(--theme-color);
    font-size: 12px;
  }

  .wbs-template-manager__node-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .wbs-template-manager__node-actions {
    position: absolute;
    top: 50%;
    right: 0;
    display: flex;
    gap: 2px;
    padding-left: 12px;
    background: linear-gradient(to right, transparent, var(--default-box-color) 12px);
    opacity: 0;
    pointer-events: none;
    transform: translateY(-50%);
    transition: opacity var(--art-motion-duration-fast);
  }

  .wbs-template-manager__node:hover .wbs-template-manager__node-actions,
  .wbs-template-manager__node:focus-within .wbs-template-manager__node-actions {
    opacity: 1;
    pointer-events: auto;
  }

  @media (hover: none) {
    .wbs-template-manager__node-actions {
      opacity: 1;
      pointer-events: auto;
    }
  }

  @media (width <= 760px) {
    .wbs-template-manager {
      grid-template-rows: auto minmax(0, 1fr);
      grid-template-columns: 1fr;
      gap: var(--art-space-3);
    }

    .wbs-template-manager__list {
      max-height: 190px;
      padding-right: 0;
      padding-bottom: var(--art-space-2);
      border-right: 0;
      border-bottom: 1px solid var(--el-border-color-lighter);
    }
  }
</style>
