<template>
  <ArtPermissionGuard permission="PmWbs:View" resource-name="WBS 工作分解">
    <div class="wbs-page">
      <div class="wbs-page__topbar">
        <BusinessWorkspaceHeader
          eyebrow="WORK BREAKDOWN STRUCTURE"
          title="WBS 工作分解"
          description="定义项目工作范围、交付物和责任边界，基线审批后通过版本变更维护。"
          icon="ri:node-tree"
          :tags="tags"
          :metrics="metrics"
        >
          <template #actions>
            <ElButton
              v-auth="'PmWbs:Submit'"
              type="warning"
              :disabled="!editable || !state.workspace.nodes.length"
              @click="transition('submit')"
              >提交审批</ElButton
            >
            <ElButton
              v-auth="'PmWbs:Approve'"
              type="success"
              :disabled="state.workspace.version?.status !== 'submitted'"
              @click="transition('approve')"
              >审批通过</ElButton
            >
          </template>
        </BusinessWorkspaceHeader>
      </div>
      <ArtSectionCard
        class="wbs-page__workspace"
        :show-scrollbar="false"
        :loading="state.loading"
        :error="state.error"
        :empty="!state.loading && !state.error && !state.workspace.version"
        empty-title="暂无 WBS 版本"
        empty-description="选择项目后新建 WBS 草稿。"
        @retry="loadWorkspace"
      >
        <div class="wbs-page__filters">
          <div class="wbs-page__filter-options">
            <ElCheckbox v-model="state.milestonesOnly">仅里程碑</ElCheckbox>
            <ElCheckbox v-model="state.showArchived">显示已归档</ElCheckbox>
          </div>
          <div class="wbs-page__actions">
            <div class="wbs-page__selectors">
              <strong>项目名称</strong>
              <ElSelect
                v-model="state.projectId"
                class="wbs-page__project"
                placeholder="选择项目"
                @change="handleProjectChange"
              >
                <ElOption
                  v-for="item in state.projects"
                  :key="item.id"
                  :label="`${item.projectName} · ${item.projectCode}`"
                  :value="item.id"
                />
              </ElSelect>
              <strong>版本</strong>
              <ElSelect
                v-model="state.versionId"
                class="wbs-page__version"
                placeholder="选择版本"
                :disabled="!state.versions.length"
                @change="loadWorkspace"
              >
                <ElOption
                  v-for="item in state.versions"
                  :key="item.id"
                  :label="`V${item.version_no} · ${statusLabel(item.status)}`"
                  :value="item.id"
                />
              </ElSelect>
            </div>
            <div class="wbs-page__management-actions">
              <ElButton
                v-auth="'PmWbs:ManageVersion'"
                type="primary"
                :disabled="!state.projectId"
                @click="createDraft"
                >新建版本</ElButton
              >
              <ElButton
                v-auth="'PmWbs:ManageTemplate'"
                :disabled="!editable"
                @click="openTemplateApply"
                >套用模板</ElButton
              >
              <ElButton v-auth="'PmWbs:ManageTemplate'" @click="openTemplateManager"
                >模板管理</ElButton
              >
              <ArtExcelImport
                v-auth="'PmWbs:Import'"
                :disabled="!editable"
                :button-props="{ type: 'default' }"
                @import-success="handleImport"
              />
              <ArtExcelExport
                v-auth="'PmWbs:Export'"
                type="default"
                :data="exportRows"
                filename="WBS工作分解"
                button-text="导出清单"
              />
            </div>
          </div>
        </div>

        <ArtWorkspaceSplitter
          class="wbs-page__content"
          primary-size="25%"
          primary-min="260px"
          primary-max="50%"
          :breakpoint="900"
          narrow-mode="stack"
        >
          <template #primary>
            <section class="wbs-page__tree-panel">
              <div class="wbs-page__panel-heading">
                <div>
                  <span>
                    <ArtSvgIcon icon="ri:apps-2-line" />
                    <strong>WBS 结构</strong>
                  </span>
                  <small>选择节点查看并维护工作包属性</small>
                </div>
                <div class="wbs-page__tree-actions">
                  <ArtTreeExpandToggle
                    :tree="treeRef"
                    :data="filteredTree"
                    label="WBS 树"
                    :default-expanded="filteredNodes.length < 24"
                  />
                  <ArtIconButton
                    v-auth="'PmWbs:Add'"
                    icon="ri:add-line"
                    label="新增根节点"
                    :disabled="!editable"
                    @click="addNode(null)"
                  />
                  <ArtIconButton
                    icon="ri:refresh-line"
                    label="刷新 WBS"
                    :disabled="state.loading"
                    @click="loadWorkspace"
                  />
                </div>
              </div>
              <div class="wbs-page__filter-row">
                <ElInput
                  v-model="state.keyword"
                  clearable
                  placeholder="搜索编码、名称或责任人"
                  aria-label="搜索 WBS 节点"
                  class="wbs-page__keyword"
                >
                  <template #prefix>
                    <ArtSvgIcon icon="ri:search-line" />
                  </template>
                </ElInput>
              </div>

              <ElScrollbar class="wbs-page__tree-scroll">
                <div v-if="!filteredNodes.length" class="wbs-page__tree-empty">
                  <ArtEmptyState
                    size="compact"
                    :title="state.workspace.nodes.length ? '当前筛选没有节点' : '还没有 WBS 节点'"
                    :description="
                      state.workspace.nodes.length
                        ? archivedNodeCount && !state.showArchived
                          ? `当前版本有 ${archivedNodeCount} 个节点已归档，勾选“显示已归档”即可查看并恢复。`
                          : '调整搜索关键字或取消筛选条件后再试。'
                        : '通过“套用模板”或“新增根节点”开始分解项目范围。'
                    "
                  />
                </div>
                <ElTree
                  v-if="filteredNodes.length"
                  ref="treeRef"
                  node-key="id"
                  draggable
                  default-expand-all
                  :data="filteredTree"
                  :props="treeProps"
                  :current-node-key="selectedNode?.id"
                  :allow-drop="allowDrop"
                  :allow-drag="allowDrag"
                  highlight-current
                  :expand-on-click-node="false"
                  @node-click="selectNode"
                  @node-drop="handleDrop"
                >
                  <template #default="{ data }">
                    <div class="wbs-tree-node"
                      ><span class="wbs-tree-node__icon" aria-hidden="true">
                        <ArtSvgIcon icon="ri:folder-3-line" /> </span
                      ><span class="wbs-tree-node__code">{{ data.wbs_code }}</span
                      ><span
                        class="wbs-tree-node__name"
                        :class="{ 'is-disabled': data.status !== 'active' }"
                        :title="data.name"
                        >{{ data.name }}</span
                      >
                      <ElTag v-if="data.is_milestone" size="small" type="warning">里程碑</ElTag>
                      <ElTag v-if="data.status === 'archived'" size="small" type="info"
                        >已归档</ElTag
                      ><span class="wbs-tree-node__actions">
                        <ArtIconButton
                          v-if="data.status === 'archived'"
                          v-auth="'PmWbs:Archive'"
                          icon="ri:arrow-go-back-line"
                          label="恢复节点"
                          :disabled="!editable"
                          @click.stop="restoreNode(data)"
                        />
                        <template v-else>
                          <ArtIconButton
                            v-auth="'PmWbs:Add'"
                            icon="ri:add-line"
                            label="新增下级节点"
                            :disabled="!editable"
                            @click.stop="addNode(data.id)"
                          />
                          <ArtIconButton
                            v-auth="'PmWbs:Edit'"
                            icon="ri:edit-line"
                            label="编辑节点"
                            :disabled="!editable"
                            @click.stop="editNode(data)"
                          />
                          <ArtIconButton
                            v-auth="'PmWbs:Delete'"
                            icon="ri:delete-bin-line"
                            label="删除节点"
                            tone="danger"
                            :disabled="!editable"
                            @click.stop="deleteNode(data)"
                          />
                        </template>
                      </span>
                    </div>
                  </template>
                </ElTree>
              </ElScrollbar>
              <small class="wbs-page__tree-summary" aria-live="polite">
                全部节点({{ filteredNodes.length }} 个节点)
              </small>
            </section>
          </template>
          <section class="wbs-page__detail-panel">
            <div class="wbs-page__panel-title">
              <div>
                <strong>{{ selectedNode ? '工作包属性' : '选择一个 WBS 节点' }}</strong>
                <span v-if="selectedNode">{{ selectedNode.wbs_code }}</span>
              </div>
              <ElButton
                v-if="selectedNode?.status === 'archived'"
                v-auth="'PmWbs:Archive'"
                text
                type="primary"
                :disabled="!editable"
                @click="restoreNode(selectedNode)"
                >恢复节点</ElButton
              >
              <ElButton
                v-else-if="selectedNode"
                v-auth="'PmWbs:Edit'"
                text
                type="primary"
                :disabled="!editable"
                @click="editNode(selectedNode)"
                >编辑节点</ElButton
              >
            </div>
            <template v-if="selectedNode">
              <ElAlert
                v-if="selectedNode.status === 'archived'"
                type="info"
                :closable="false"
                show-icon
                class="wbs-form__archived"
                title="该节点已归档"
                :description="
                  editable
                    ? '归档节点不参与范围分解展示，恢复后才会重新出现在结构树中。'
                    : '当前版本不可编辑，切换或新建草稿版本后才能恢复。'
                "
              />
              <ArtForm
                v-model="selectedNode"
                :items="nodeFormItems"
                :span="24"
                label-position="top"
                :show-reset="false"
                :show-submit="false"
                disabled
                class="wbs-form"
              />
              <ElCheckbox v-model="selectedNode.is_milestone" disabled>标记为里程碑</ElCheckbox>
              ><div class="wbs-links"
                ><strong>交付物与关联</strong>
                <p
                  >交付物 {{ deliverablesForSelected.length }} 项 · 业务关联
                  {{ linksForSelected.length }} 项</p
                >
                <ElTag v-for="link in linksForSelected" :key="link.id" size="small" class="mr-1">{{
                  link.business_type
                }}</ElTag>
              </div>
              <div class="wbs-boundaries"
                ><strong>范围边界</strong>
                <div
                  v-for="type in ['included', 'excluded']"
                  :key="type"
                  class="wbs-boundaries__row"
                  ><span>{{ type === 'included' ? '包含' : '不包含' }}</span>
                  <ElInput
                    v-model="boundaryDraft[type as 'included' | 'excluded']"
                    size="small"
                    :disabled="!editable"
                    :placeholder="
                      type === 'included' ? '输入本版本包含的工作范围' : '输入明确排除的工作范围'
                    "
                  />
                  <ElButton
                    v-auth="'PmWbs:ManageScope'"
                    size="small"
                    :disabled="!editable"
                    @click="saveBoundary(type as 'included' | 'excluded')"
                    >保存</ElButton
                  >
                </div>
              </div>
            </template>
            <div v-else class="wbs-page__detail-empty">
              <ArtEmptyState
                size="compact"
                title="尚未选择工作节点"
                :description="
                  filteredNodes.length
                    ? '从左侧结构树选择节点后，在这里查看并维护工作包属性。'
                    : '当前筛选条件下没有可查看的节点，请调整搜索关键字或筛选条件后再试。'
                "
              />
            </div>
          </section>
        </ArtWorkspaceSplitter>
      </ArtSectionCard>
      <WbsNodeDialog ref="nodeDialogRef" :on-submit="saveNodeFromDialog" />
      <WbsTemplateApplyDialog ref="templateApplyRef" @success="handleTemplateApplied" />
      <WbsTemplateManager ref="templateManagerRef" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="ts">
  import { computed, onMounted, reactive, ref, watch } from 'vue'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import {
    ElButton,
    ElCheckbox,
    ElAlert,
    ElInput,
    ElMessage,
    ElOption,
    ElSelect,
    ElScrollbar,
    ElTag,
    ElTree,
    type TreeInstance,
    type TreeNodeData
  } from 'element-plus'
  import ArtExcelExport from '@/components/core/forms/art-excel-export/index.vue'
  import ArtExcelImport from '@/components/core/forms/art-excel-import/index.vue'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtWorkspaceSplitter from '@/components/core/layouts/art-workspace-splitter/index.vue'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import ArtTreeExpandToggle from '@/components/core/widget/art-tree-expand-toggle/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric,
    type BusinessWorkspaceTag
  } from '@/components/business/business-workspace-header/index.vue'
  import { normalizeNonNullableText } from '@/utils/form/normalize'
  import {
    buildWbsTree,
    collectWbsSubtreeIds,
    hasWbsCycle,
    nextWbsCode,
    type WbsTreeNode
  } from './wbs-model'
  import {
    createWbsVersion,
    fetchWbsWorkspace,
    listWbsProjects,
    listWbsVersions,
    saveWbsBoundary,
    saveWbsNodes,
    toWbsError,
    transitionWbs,
    type WbsProjectOption,
    type WbsVersionOption
  } from '@pm/api/wbs'
  import type { WbsNode, WbsWorkspace } from '@pm/types/wbs'
  import WbsNodeDialog, { type WbsNodeDialogOpenData } from './modules/wbs-node-dialog.vue'
  import WbsTemplateApplyDialog, {
    type WbsTemplateApplyOpenData
  } from './modules/wbs-template-apply-dialog.vue'
  import WbsTemplateManager from './modules/wbs-template-manager.vue'

  defineOptions({ name: 'PmWbs' })
  interface WbsNodeDialogExpose {
    handleOpen: (data: WbsNodeDialogOpenData) => Promise<void>
  }
  interface WbsTemplateApplyDialogExpose {
    handleOpen: (data: WbsTemplateApplyOpenData) => Promise<void>
  }
  interface WbsTemplateManagerExpose {
    handleOpen: () => Promise<void>
  }
  const declaredPermissionCodes = [
    'PmWbs:Archive',
    'PmWbs:Delete',
    'PmWbs:Move',
    'PmWbs:Reject',
    'PmWbs:ManageDeliverable',
    'PmWbs:LinkBusiness',
    'PmWbs:ViewHistory'
  ] as const
  void declaredPermissionCodes
  const tags: BusinessWorkspaceTag[] = [
    { label: '范围基线', type: 'primary', effect: 'plain' },
    { label: '多级分解', type: 'success', effect: 'light' },
    { label: '跨模块关联', type: 'warning', effect: 'light' }
  ]
  const state = reactive({
    projects: [] as WbsProjectOption[],
    versions: [] as WbsVersionOption[],
    projectId: '',
    versionId: '',
    keyword: '',
    milestonesOnly: false,
    showArchived: false,
    loading: false,
    error: null as Error | null,
    workspace: {
      version: null,
      nodes: [],
      deliverables: [],
      boundaries: [],
      links: []
    } as WbsWorkspace
  })
  const selectedNode = ref<WbsNode | null>(null)
  const nodeDialogRef = ref<WbsNodeDialogExpose>()
  const templateApplyRef = ref<WbsTemplateApplyDialogExpose>()
  const templateManagerRef = ref<WbsTemplateManagerExpose>()
  const { confirmAction, confirmDelete } = useArtFeedback()
  const boundaryDraft = reactive<{ included: string; excluded: string }>({
    included: '',
    excluded: ''
  })
  const treeRef = ref<TreeInstance>()
  const treeProps = { children: 'children', label: 'name' }
  const editable = computed(() => state.workspace.version?.status === 'draft')
  const selectedProjectName = computed(
    () => state.projects.find((p) => p.id === state.projectId)?.projectName ?? '未选择项目'
  )
  const statusLabel = (status?: WbsVersionOption['status'] | null) =>
    ({
      draft: '草稿',
      submitted: '审批中',
      approved: '已批准基线',
      rejected: '已退回',
      cancelled: '已取消',
      superseded: '历史版本'
    })[status ?? 'draft'] ?? '未建立'
  const filteredNodes = computed(() =>
    state.workspace.nodes.filter(
      (node) =>
        (state.showArchived || node.status !== 'archived') &&
        (!state.keyword ||
          `${node.wbs_code}${node.name}${node.responsible_person ?? ''}`
            .toLowerCase()
            .includes(state.keyword.toLowerCase())) &&
        (!state.milestonesOnly || node.is_milestone)
    )
  )
  const archivedNodeCount = computed(
    () => state.workspace.nodes.filter((node) => node.status === 'archived').length
  )
  const filteredTree = computed(() => buildWbsTree(filteredNodes.value))
  watch(
    filteredNodes,
    (nodes) => {
      if (selectedNode.value && !nodes.some((node) => node.id === selectedNode.value?.id)) {
        selectedNode.value = null
      }
    },
    { flush: 'post' }
  )
  const nodeFormItems = computed<FormItem[]>(() => [
    { label: '工作名称', key: 'name', type: 'input', props: { maxlength: 160 } },
    { label: '工作内容描述', key: 'description', type: 'textarea', props: { rows: 2 } },
    { label: '工程量', key: 'quantity', type: 'number', props: { min: 0 } },
    { label: '计量单位', key: 'unit', type: 'input' },
    { label: '计划工程量', key: 'planned_quantity', type: 'number', props: { min: 0 } },
    { label: '预算成本', key: 'budget_cost', type: 'number', props: { min: 0, precision: 2 } },
    { label: '责任部门', key: 'responsible_department', type: 'input' },
    { label: '责任人', key: 'responsible_person', type: 'input' },
    { label: '质量标准', key: 'quality_standard', type: 'textarea', props: { rows: 2 } }
  ])
  const deliverablesForSelected = computed(() =>
    state.workspace.deliverables.filter((item) => item.node_id === selectedNode.value?.id)
  )
  const linksForSelected = computed(() =>
    state.workspace.links.filter((item) => item.wbs_node_id === selectedNode.value?.id)
  )
  const metrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '当前版本',
      value: state.workspace.version ? `V${state.workspace.version.version_no}` : '--',
      description: statusLabel(state.workspace.version?.status),
      icon: 'ri:git-branch-line'
    },
    {
      label: '工作节点',
      value: state.workspace.nodes.filter((node) => node.status !== 'archived').length,
      description: archivedNodeCount.value
        ? `另有 ${archivedNodeCount.value} 个已归档`
        : '范围分解节点',
      icon: 'ri:node-tree',
      tone: 'info'
    },
    {
      label: '里程碑',
      value: state.workspace.nodes.filter((n) => n.is_milestone && n.status !== 'archived').length,
      description: '关键交付节点',
      icon: 'ri:flag-line',
      tone: 'warning'
    },
    {
      label: '业务关联',
      value: state.workspace.links.length,
      description: '进度 / 资源 / 实施',
      icon: 'ri:links-line',
      tone: 'success'
    }
  ])
  const exportRows = computed(() =>
    state.workspace.nodes.map((node) => ({
      wbs_code: node.wbs_code,
      name: node.name,
      description: node.description ?? '',
      deliverable_summary: node.deliverable_summary ?? '',
      quantity: node.quantity ?? '',
      unit: node.unit ?? '',
      planned_quantity: node.planned_quantity ?? '',
      budget_cost: node.budget_cost ?? '',
      responsible_department: node.responsible_department ?? '',
      responsible_person: node.responsible_person ?? '',
      quality_standard: node.quality_standard ?? '',
      is_milestone: node.is_milestone ? '是' : '否',
      status: node.status
    }))
  )

  async function loadWorkspace() {
    if (!state.projectId) return
    state.loading = true
    state.error = null
    try {
      state.workspace = await fetchWbsWorkspace(state.projectId, state.versionId || undefined)
      selectedNode.value = state.workspace.nodes.find((node) => node.status !== 'archived') ?? null
      boundaryDraft.included =
        state.workspace.boundaries.find((item) => item.boundary_type === 'included')?.content ?? ''
      boundaryDraft.excluded =
        state.workspace.boundaries.find((item) => item.boundary_type === 'excluded')?.content ?? ''
    } catch (error) {
      state.error = toWbsError(error)
    } finally {
      state.loading = false
    }
  }
  async function loadVersions() {
    state.versions = state.projectId ? await listWbsVersions(state.projectId) : []
    state.versionId = state.versions[0]?.id ?? ''
  }
  async function handleProjectChange() {
    await loadVersions()
    await loadWorkspace()
  }
  async function bootstrap() {
    try {
      state.projects = await listWbsProjects()
      state.projectId = state.projects[0]?.id ?? ''
      await loadVersions()
      await loadWorkspace()
    } catch (error) {
      state.error = toWbsError(error)
    }
  }
  async function createDraft() {
    if (!state.projectId) return
    const result = await createWbsVersion(
      state.projectId,
      `${selectedProjectName.value} WBS 工作分解`
    )
    if (result.data) {
      await loadVersions()
      state.versionId = result.data.id
      await loadWorkspace()
    }
  }
  function selectNode(node: WbsNode) {
    selectedNode.value = node
  }
  async function deleteNode(node: WbsNode) {
    if (!editable.value) return
    const descendants = collectWbsSubtreeIds(state.workspace.nodes, node.id)
    await confirmDelete(
      descendants.size > 1
        ? `确定删除“${node.name}”及其 ${descendants.size - 1} 个下级节点吗？`
        : `确定删除“${node.name}”吗？`
    )
    for (const candidate of state.workspace.nodes) {
      if (descendants.has(candidate.id)) candidate.status = 'archived'
    }
    if (selectedNode.value && descendants.has(selectedNode.value.id)) selectedNode.value = null
    await save()
  }
  async function restoreNode(node: WbsNode) {
    if (!editable.value) return
    const restored = collectWbsSubtreeIds(state.workspace.nodes, node.id)
    const archivedCount = state.workspace.nodes.filter(
      (candidate) => restored.has(candidate.id) && candidate.status === 'archived'
    ).length
    await confirmAction(
      archivedCount > 1
        ? `确定恢复“${node.name}”及其 ${archivedCount - 1} 个已归档下级节点吗？`
        : `确定恢复“${node.name}”吗？`,
      '恢复节点确认',
      { type: 'info', confirmButtonText: '恢复' }
    )
    for (const candidate of state.workspace.nodes) {
      if (restored.has(candidate.id) && candidate.status === 'archived') candidate.status = 'active'
    }
    selectedNode.value = state.workspace.nodes.find((candidate) => candidate.id === node.id) ?? null
    await save()
  }
  const createNodeDraft = (parentId: string | null): WbsNode => ({
    id: crypto.randomUUID(),
    version_id: state.workspace.version!.id,
    parent_id: parentId,
    sort_order: state.workspace.nodes.filter((item) => item.parent_id === parentId).length,
    wbs_code: nextWbsCode(state.workspace.nodes, parentId),
    custom_code: null,
    name: '',
    description: null,
    deliverable_summary: null,
    quantity: null,
    unit: null,
    planned_quantity: null,
    budget_cost: null,
    responsible_department: null,
    responsible_person: null,
    quality_standard: null,
    is_milestone: false,
    status: 'active',
    metadata: {}
  })
  async function addNode(parentId: string | null) {
    if (!state.workspace.version || !editable.value) return
    await nodeDialogRef.value?.handleOpen({ mode: 'create', node: createNodeDraft(parentId) })
  }
  async function editNode(node: WbsNode) {
    if (!editable.value) return
    const target = state.workspace.nodes.find((item) => item.id === node.id)
    if (!target) return
    selectedNode.value = target
    await nodeDialogRef.value?.handleOpen({ mode: 'edit', node: { ...target } })
  }
  async function saveNodeFromDialog(node: WbsNode): Promise<boolean> {
    if (!state.workspace.version || !editable.value) return false
    try {
      const existing = state.workspace.nodes.find((item) => item.id === node.id)
      if (existing) Object.assign(existing, node)
      else state.workspace.nodes.push(node)
      await save()
      selectedNode.value = state.workspace.nodes.find((item) => item.id === node.id) ?? null
      return true
    } catch (error) {
      ElMessage.error(toWbsError(error).message)
      return false
    }
  }
  function allowDrag(node: TreeNodeData): boolean {
    return editable.value && (node as WbsTreeNode).status !== 'archived'
  }
  function allowDrop(_dragging: TreeNodeData, _drop: TreeNodeData, type: string): boolean {
    return editable.value && type !== 'inner'
  }
  async function handleDrop(
    draggingNode: { data: TreeNodeData },
    dropNode: { data: TreeNodeData },
    type: 'before' | 'after' | 'inner'
  ) {
    const dragging = draggingNode.data as WbsTreeNode
    const _drop = dropNode.data as WbsTreeNode
    if (!selectedNode.value || !state.workspace.version) return
    const parentId = type === 'inner' ? _drop.id : _drop.parent_id
    if (hasWbsCycle(state.workspace.nodes, dragging.id, parentId)) {
      ElMessage.warning('不能把节点移动到自己的下级节点')
      await loadWorkspace()
      return
    }
    dragging.parent_id = parentId
    await save()
  }
  async function save() {
    if (!state.workspace.version || !editable.value) return
    await saveWbsNodes(
      state.workspace.nodes.map((node) => ({ ...node, version_id: state.workspace.version!.id }))
    )
    await loadWorkspace()
  }
  async function saveBoundary(type: 'included' | 'excluded') {
    if (!state.workspace.version || !boundaryDraft[type].trim()) return
    await saveWbsBoundary({
      version_id: state.workspace.version.id,
      boundary_type: type,
      content: normalizeNonNullableText(boundaryDraft[type]),
      sort_order: 0
    })
    await loadWorkspace()
  }
  async function transition(action: 'submit' | 'approve') {
    if (!state.workspace.version) return
    await transitionWbs(state.workspace.version.id, action)
    await loadWorkspace()
  }
  async function openTemplateApply() {
    if (!state.workspace.version || !state.projectId) return
    await templateApplyRef.value?.handleOpen({
      projectId: state.projectId,
      versionId: state.workspace.version.id,
      versionLabel: `V${state.workspace.version.version_no} · ${statusLabel(state.workspace.version.status)}`
    })
  }
  async function openTemplateManager() {
    await templateManagerRef.value?.handleOpen()
  }
  async function handleTemplateApplied() {
    await loadWorkspace()
  }
  async function handleImport(rows: Array<Record<string, unknown>>) {
    if (!editable.value || !state.workspace.version) return
    const imported = rows
      .filter((row) => String(row['工作名称'] ?? row.name ?? '').trim())
      .map((row, index) => ({
        id: crypto.randomUUID(),
        version_id: state.workspace.version!.id,
        parent_id: null,
        sort_order: index,
        wbs_code: String(row['WBS 编码'] ?? row.wbs_code ?? `${index + 1}`),
        custom_code: null,
        name: String(row['工作名称'] ?? row.name),
        description: String(row['描述'] ?? row.description ?? ''),
        deliverable_summary: String(row['交付物'] ?? row.deliverable_summary ?? ''),
        quantity: Number(row['工程量'] ?? row.quantity) || null,
        unit: String(row['计量单位'] ?? row.unit ?? ''),
        planned_quantity: Number(row['计划工程量'] ?? row.planned_quantity) || null,
        budget_cost: Number(row['预算成本'] ?? row.budget_cost) || null,
        responsible_department: String(row['责任部门'] ?? ''),
        responsible_person: String(row['责任人'] ?? ''),
        quality_standard: String(row['质量标准'] ?? ''),
        is_milestone: String(row['是否里程碑'] ?? '').toLowerCase() === '是',
        status: 'active' as const,
        metadata: {}
      }))
    if (!imported.length) {
      ElMessage.warning('导入文件中没有有效工作名称')
      return
    }
    state.workspace.nodes = imported
    await save()
  }
  onMounted(bootstrap)
</script>

<style scoped lang="scss">
  .wbs-page {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: var(--art-space-3);
    min-width: 0;
    min-height: 0;
    height: var(--art-full-height);
    max-height: var(--art-full-height);
    padding: 0;
    overflow: hidden;
    background: var(--art-bg-color);
  }

  .wbs-page__project {
    flex: 0 1 260px;
    width: 260px;
    min-width: 150px;
  }

  .wbs-page__topbar {
    display: grid;
    flex: 0 0 auto;
    gap: var(--art-space-3);
    padding-bottom: var(--art-space-1);
    background: var(--art-bg-color);
  }

  .wbs-page__version {
    width: 190px;
  }

  .wbs-page__version-summary,
  .wbs-page__actions {
    display: flex;
    gap: var(--art-space-3);
    align-items: center;
    min-width: 0;
  }

  .wbs-page__actions {
    justify-content: space-between;
    min-height: 44px;
    padding: 4px var(--art-space-2);
    border: 1px solid var(--el-border-color-lighter);
    border-radius: var(--el-border-radius-base);
    box-sizing: border-box;
  }

  .wbs-page__selectors,
  .wbs-page__management-actions {
    display: flex;
    flex: 0 0 auto;
    gap: var(--art-space-3);
    align-items: center;
  }

  .wbs-page__management-actions {
    margin-left: auto;
  }

  .wbs-page__version-summary div {
    display: grid;
    min-width: 0;
  }

  .wbs-page__version-summary small {
    color: var(--el-text-color-secondary);
  }

  .wbs-page__status {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--el-color-info);
  }

  .wbs-page__status.is-draft {
    background: var(--el-color-warning);
  }

  .wbs-page__status.is-approved {
    background: var(--el-color-success);
  }

  .wbs-page__status.is-submitted {
    background: var(--el-color-primary);
  }

  .wbs-page__workspace {
    display: flex;
    flex-direction: column;
    flex: 1 1 0%;
    min-height: 0;
    max-height: 100%;
    overflow: hidden;
  }

  .wbs-page__workspace :deep(.art-section-card__scrollbar),
  .wbs-page__workspace
    :deep(.art-section-card__scrollbar > .el-scrollbar__wrap > .el-scrollbar__view) {
    min-height: 0;
  }

  .wbs-page__workspace :deep(.art-section-card__body) {
    display: grid;
    flex: 1 1 0%;
    grid-template-rows: auto minmax(0, 1fr);
    min-height: 0;
    height: auto;
    overflow: hidden;
  }

  .wbs-page__filters {
    display: grid;
    grid-template-columns: minmax(260px, calc(25% - 8px)) minmax(0, 1fr);
    column-gap: 16px;
    align-items: center;
    padding-top: var(--art-space-1);
    background: var(--default-box-color);
    margin-bottom: var(--art-space-3);
  }

  .wbs-page__filter-options {
    display: flex;
    align-items: center;
    min-width: 0;
    min-height: 36px;
    padding: 0 var(--art-space-2);
    border: 1px solid var(--el-border-color-lighter);
    border-radius: var(--el-border-radius-base);
    box-sizing: border-box;
  }

  .wbs-page__filter-row {
    display: flex;
    flex: 0 0 auto;
    gap: var(--art-space-2);
    align-items: center;
    min-width: 0;
  }

  .wbs-page__filter-row > strong {
    flex: 0 0 auto;
    white-space: nowrap;
  }

  .wbs-page__keyword {
    flex: 1 1 auto;
    width: auto;
    min-width: 0;
  }

  .wbs-page__content {
    min-height: 0;
    height: auto;
    flex: 1 1 0%;
    overflow: hidden;
  }

  .wbs-page__tree-panel,
  .wbs-page__detail-panel {
    min-width: 0;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    padding: var(--art-space-3) var(--art-space-4);
    background: var(--default-box-color);
  }

  .wbs-page__tree-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: var(--el-border-radius-base);
    overflow: hidden;
  }

  .wbs-page__detail-panel {
    border: 1px solid var(--el-border-color-lighter);
    border-radius: var(--el-border-radius-base);
  }

  .wbs-page__panel-title {
    display: flex;
    justify-content: space-between;
    padding-bottom: var(--art-space-3);
    color: var(--el-text-color-secondary);
    border-bottom: 1px solid var(--el-border-color-lighter);
  }

  .wbs-page__detail-empty {
    display: grid;
    place-items: center;
    min-height: 200px;
  }

  .wbs-page__panel-title strong {
    color: var(--el-text-color-primary);
  }

  .wbs-page__panel-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--art-space-3);
    padding-bottom: var(--art-space-3);
    border-bottom: 1px solid var(--el-border-color-lighter);
  }

  .wbs-page__panel-heading > div:first-child {
    display: grid;
    gap: 3px;
    min-width: 0;
  }

  .wbs-page__panel-heading strong {
    color: var(--el-text-color-primary);
  }

  .wbs-page__panel-heading small {
    color: var(--el-text-color-secondary);
    font-size: 12px;
  }

  .wbs-page__tree-actions {
    display: flex;
    flex: 0 0 auto;
    gap: 2px;
  }

  .wbs-page__all:hover,
  .wbs-page__all.is-current {
    background: color-mix(in srgb, var(--theme-color) 9%, var(--default-box-color));
    border-color: color-mix(in srgb, var(--theme-color) 22%, transparent);
  }

  .wbs-page__all.is-current {
    box-shadow: inset 3px 0 0 var(--theme-color);
  }

  .wbs-page__all:focus-visible {
    outline: 2px solid var(--theme-color);
    outline-offset: 2px;
  }

  .wbs-page__all > span:first-child {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    color: var(--theme-color);
    background: var(--default-box-color);
    border-radius: var(--el-border-radius-base);
  }

  .wbs-page__all > span:nth-child(2) {
    display: grid;
    min-width: 0;
  }

  .wbs-page__all strong {
    color: var(--el-text-color-primary);
  }

  .wbs-page__all small {
    margin-top: 2px;
    font-size: 11px;
    color: var(--el-text-color-secondary);
  }

  .wbs-page__tree-scroll {
    flex: 1;
    min-height: 0;

    :deep(.el-tree-node__content) {
      height: auto;
      min-height: 36px;
    }
  }

  .wbs-page__tree-summary {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    min-height: 32px;
    padding: 0 var(--art-space-3);
    color: var(--el-text-color-secondary);
    background: var(--art-gray-100);
    border: 1px solid var(--el-border-color-lighter);
    border-radius: var(--el-border-radius-base);
    box-sizing: border-box;
    user-select: none;
  }

  .wbs-page__tree-empty {
    display: grid;
    place-items: center;
    min-height: 200px;
  }

  .wbs-form__archived {
    margin-top: var(--art-space-3);
  }

  .wbs-tree-node {
    position: relative;
    display: grid;
    grid-template-columns: 16px auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 6px;
    width: 100%;
    min-width: 0;
    padding-right: 0;
  }

  .wbs-tree-node__icon {
    display: grid;
    place-items: center;
    color: var(--el-text-color-secondary);
  }

  .wbs-tree-node__code {
    color: var(--theme-color);
    font-family: var(--el-font-family);
    font-size: 12px;
  }

  .wbs-tree-node__name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .wbs-tree-node__name.is-disabled {
    color: var(--el-text-color-placeholder);
    text-decoration: line-through;
  }

  .wbs-tree-node__actions {
    position: absolute;
    top: 50%;
    right: 4px;
    display: flex;
    gap: 2px;
    padding-left: 8px;
    background: linear-gradient(to right, transparent, var(--default-box-color) 8px);
    opacity: 0;
    pointer-events: none;
    transform: translateY(-50%);
    transition: opacity var(--art-motion-duration-fast);
  }

  .wbs-tree-node:hover .wbs-tree-node__actions,
  .wbs-tree-node:focus-within .wbs-tree-node__actions {
    opacity: 1;
    pointer-events: auto;
  }

  @media (hover: none) {
    .wbs-tree-node__actions {
      opacity: 1;
      pointer-events: auto;
    }
  }

  .wbs-form {
    padding-top: var(--art-space-3);
  }

  .wbs-form__grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--art-space-3);
  }

  .wbs-links {
    margin-top: var(--art-space-4);
    padding-top: var(--art-space-3);
    border-top: 1px solid var(--el-border-color-lighter);
  }

  .wbs-links p {
    color: var(--el-text-color-secondary);
    font-size: 12px;
  }

  .wbs-boundaries {
    display: grid;
    gap: var(--art-space-2);
    margin-top: var(--art-space-4);
    padding-top: var(--art-space-3);
    border-top: 1px solid var(--el-border-color-lighter);
  }

  .wbs-boundaries__row {
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr) auto;
    gap: var(--art-space-2);
    align-items: center;
  }

  .w-full {
    width: 100%;
  }

  @media (width <=1360px) {
    .wbs-page__actions {
      flex-wrap: wrap;
    }
  }

  @media (width <=900px) {
    .wbs-page {
      padding: 0;
      overflow: hidden;
    }

    .wbs-page__project,
    .wbs-page__version {
      width: 100%;
    }

    .wbs-page__filters {
      grid-template-columns: 1fr;
      row-gap: var(--art-space-2);
    }

    .wbs-page__actions,
    .wbs-page__selectors,
    .wbs-page__management-actions {
      flex-wrap: wrap;
    }

    .wbs-page__content {
      height: auto;
      overflow: visible;
    }

    .wbs-page__tree-panel,
    .wbs-page__detail-panel {
      flex: 1 1 0;
      min-height: 240px;
      border: 1px solid var(--el-border-color-lighter);
      border-radius: var(--el-border-radius-base);
    }

    .wbs-page__actions {
      flex-wrap: wrap;
    }

    .wbs-form__grid {
      grid-template-columns: 1fr;
    }
  }
</style>
