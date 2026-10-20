<template>
  <ArtDialog ref="dialogRef" :confirm-on-close="mode !== 'view'">
    <ArtDescriptions
      v-if="mode === 'view'"
      :data="form"
      :items="detailItems"
      :columns="2"
      class="wbs-template-node-dialog__detail"
    />
    <ArtForm
      v-else
      ref="formRef"
      v-model="form"
      :items="formItems"
      :rules="rules"
      :span="24"
      label-position="top"
      :show-reset="false"
      :show-submit="false"
    />
  </ArtDialog>
</template>

<script setup lang="ts">
  import { h, reactive, ref } from 'vue'
  import { ElTag, type FormRules } from 'element-plus'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import type { ArtDescriptionItem } from '@/components/core/base/art-descriptions/types'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import { normalizeNullableText, normalizeNonNullableText } from '@/utils/form/normalize'
  import type { WbsTemplateNode } from '@pm/types/wbs'

  export interface WbsTemplateNodeDialogOpenData {
    mode: 'create' | 'edit' | 'view'
    node: WbsTemplateNode
  }

  const props = defineProps<{
    onSubmit: (node: WbsTemplateNode) => Promise<boolean>
  }>()

  interface WbsTemplateNodeDialogExpose {
    handleOpen: (data: WbsTemplateNodeDialogOpenData) => Promise<void>
  }

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

  const dialogRef = ref<ArtDialogExpose<WbsTemplateNode>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const mode = ref<WbsTemplateNodeDialogOpenData['mode']>('create')
  const form = reactive<WbsTemplateNode>(createEmptyNode())

  const formItems: FormItem[] = [
    {
      label: 'WBS 编码',
      key: 'wbs_code',
      type: 'input',
      span: 12,
      props: { maxlength: 40, placeholder: '例如：1、1.1' }
    },
    {
      label: '工作名称',
      key: 'name',
      type: 'input',
      span: 12,
      props: { maxlength: 160, placeholder: '请输入工作名称' }
    },
    {
      label: '工作内容描述',
      key: 'description',
      type: 'textarea',
      span: 24,
      props: { rows: 3, maxlength: 1000, placeholder: '请输入工作内容描述' }
    },
    {
      label: '交付物摘要',
      key: 'deliverable_summary',
      type: 'textarea',
      span: 24,
      props: { rows: 2, maxlength: 500, placeholder: '请输入交付物摘要' }
    },
    {
      label: '计量单位',
      key: 'unit',
      type: 'input',
      span: 12,
      props: { maxlength: 30, placeholder: '例如：项、m、m²' }
    },
    {
      label: '里程碑',
      key: 'is_milestone',
      type: 'switch',
      span: 12,
      props: { activeText: '是', inactiveText: '否' }
    },
    {
      label: '质量标准',
      key: 'quality_standard',
      type: 'textarea',
      span: 24,
      props: { rows: 2, maxlength: 500, placeholder: '请输入质量标准或验收要求' }
    }
  ]

  const rules: FormRules<WbsTemplateNode> = {
    wbs_code: [{ required: true, message: '请输入 WBS 编码', trigger: 'blur' }],
    name: [{ required: true, message: '请输入工作名称', trigger: 'blur' }]
  }

  const detailItems: ArtDescriptionItem<WbsTemplateNode>[] = [
    { key: 'wbs_code', label: 'WBS 编码', field: 'wbs_code' },
    { key: 'name', label: '工作名称', field: 'name' },
    { key: 'description', label: '工作内容描述', field: 'description', span: 2 },
    { key: 'deliverable_summary', label: '交付物摘要', field: 'deliverable_summary', span: 2 },
    { key: 'unit', label: '计量单位', field: 'unit' },
    {
      key: 'is_milestone',
      label: '里程碑',
      field: 'is_milestone',
      render: (value) =>
        h(ElTag, { size: 'small', type: value ? 'warning' : 'info', effect: 'light' }, () =>
          value ? '是' : '否'
        )
    },
    { key: 'quality_standard', label: '质量标准', field: 'quality_standard', span: 2 }
  ]

  const handleOpen = async (data: WbsTemplateNodeDialogOpenData): Promise<void> => {
    mode.value = data.mode
    Object.assign(form, createEmptyNode(), data.node)
    formRef.value?.clearValidate()
    await dialogRef.value?.handleOpen(form, {
      title:
        data.mode === 'view'
          ? '查看模板节点'
          : data.mode === 'edit'
            ? '编辑模板节点'
            : '新增模板节点',
      subtitle:
        data.mode === 'view'
          ? '查看模板节点的编码、工作内容与质量标准。'
          : data.mode === 'edit'
            ? '更新模板节点信息，保存模板后写入模板明细。'
            : '填写模板节点信息，保存模板后加入模板明细。',
      titleIcon: 'ri:node-tree',
      size: 'md',
      confirmText: data.mode === 'view' ? '关闭' : data.mode === 'edit' ? '保存节点' : '新增节点',
      showCancelButton: data.mode !== 'view',
      dialogProps: { appendToBody: true, closeOnClickModal: false },
      onConfirm: async () => {
        if (data.mode === 'view') return true
        await formRef.value?.validate()
        return props.onSubmit({
          ...form,
          wbs_code: normalizeNonNullableText(form.wbs_code),
          name: normalizeNonNullableText(form.name),
          description: normalizeNullableText(form.description),
          deliverable_summary: normalizeNullableText(form.deliverable_summary),
          unit: normalizeNullableText(form.unit),
          quality_standard: normalizeNullableText(form.quality_standard)
        })
      }
    })
  }

  defineExpose<WbsTemplateNodeDialogExpose>({ handleOpen })
</script>

<style scoped lang="scss">
  .wbs-template-node-dialog__detail {
    padding-top: var(--art-space-1);
  }
</style>
