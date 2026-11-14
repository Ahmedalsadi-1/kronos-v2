// SPDX-License-Identifier: GPL-3.0-only
import { createPinia } from 'pinia'
import { createApp, h, nextTick, reactive, ref, Teleport, watch } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ConfigProvider } from 'reka-ui'
import 'primeicons/primeicons.css'
import GraphCanvas from '@/components/graph/GraphCanvas.vue'
import GlobalDialog from '@/components/dialog/GlobalDialog.vue'
import RightSidePanel from '@/components/rightSidePanel/RightSidePanel.vue'
import LogsTerminal from '@/components/bottomPanel/tabs/terminal/LogsTerminal.vue'
import { useAssetsSidebarTab } from '@/composables/sidebarTabs/useAssetsSidebarTab'
import { useJobHistorySidebarTab } from '@/composables/sidebarTabs/useJobHistorySidebarTab'
import { useModelLibrarySidebarTab } from '@/composables/sidebarTabs/useModelLibrarySidebarTab'
import { useNodeLibrarySidebarTab } from '@/composables/sidebarTabs/useNodeLibrarySidebarTab'
import { useAppsSidebarTab } from '@/platform/workflow/management/composables/useAppsSidebarTab'
import { useWorkflowsSidebarTab } from '@/platform/workflow/management/composables/useWorkflowsSidebarTab'
import { useSidebarTabStore } from '@/stores/workspace/sidebarTabStore'
import { useQueueStore } from '@/stores/queueStore'
import { useAssetsStore } from '@/stores/assetsStore'
import { useExecutionStore } from '@/stores/executionStore'
import { useModelStore } from '@/stores/modelStore'
import { useModelToNodeStore } from '@/stores/modelToNodeStore'
import { startModelLoaderDrag } from '@/composables/node/startModelNodeDragFromAsset'
import { useNodeDragToCanvas } from '@/composables/node/useNodeDragToCanvas'
import { useEventListener } from '@vueuse/core'
import { useCommandStore } from '@/platform/keybindings/commandStore'
import { useCoreCommands } from '@/composables/useCoreCommands'
import { attachLegacyUI } from '@/core/legacyUI/attachLegacyUI'
import TooltipProvider from '@comfyorg/design-system/tooltip/TooltipProvider'
import { i18n } from '@/i18n'
import { firebaseIdentity } from '@/platform/auth/firebaseIdentity'
import { refreshRemoteConfig } from '@/platform/remoteConfig/refreshRemoteConfig'
import { markStoresReady } from '@/platform/telemetry/storeReadiness'
import { useSearchBoxStore } from '@/stores/workspace/searchBoxStore'
import { toNodeId } from '@comfyorg/graph-model/nodeId'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useBootstrapStore } from '@/stores/bootstrapStore'
import { registerExtensionDialogService } from '@/services/dialogService'
import { createExtensionDialogService } from '@/services/extensionDialogService'
import { api } from '@/scripts/api'
import { app } from '@/scripts/app'
import '@/lib/litegraph/public/css/litegraph.css'
import '@/assets/css/style.css'
import { comfyHost, type ComfyHost } from './kronos-host'

export async function mountComfyEditor(options: ComfyHost) {
  const host = reactive(options)
  comfyHost.value = host
  api.api_base = host.origin
  api.api_host = new URL(host.origin).host
  await refreshRemoteConfig({ useAuth: false })
  firebaseIdentity.initialize()

  const pinia = createPinia()
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { render: () => null } }]
  })
  const vue = createApp({
    setup() {
      const ready = ref(false)
      const sidebar = useSidebarTabStore()
      const search = useSearchBoxStore()
      const queue = useQueueStore()
      const assets = useAssetsStore()
      const execution = useExecutionStore()
      const tabs = {
        assets: useAssetsSidebarTab(),
        'node-library': useNodeLibrarySidebarTab(),
        'model-library': useModelLibrarySidebarTab(),
        workflows: useWorkflowsSidebarTab(),
        apps: useAppsSidebarTab(),
        'job-history': useJobHistorySidebarTab()
      }

      useCommandStore().registerCommands(useCoreCommands())
      const refreshJobs = () => {
        void queue.update()
        if (host.panels.library === 'assets') void assets.outputAssets.loadNew()
      }
      useEventListener(api, ['status', 'execution_success', 'reconnected'], refreshJobs)
      watch(() => host.panels.library, (tab) => {
        sidebar.activeSidebarTabId = tab
      }, { immediate: true })
      watch(() => sidebar.activeSidebarTabId, (tab) => {
        if (!tab && host.panels.library) host.onClosePanel('library')
      }, { flush: 'sync' })
      watch(() => search.visible, host.onPickerChange, { flush: 'sync' })

      return () => h(ConfigProvider, { teleportTo: host.overlayTarget }, {
        default: () => h(TooltipProvider, null, {
          default: () => [
            h(GraphCanvas, { onReady: () => {
              ready.value = true
              execution.bindExecutionEvents()
              refreshJobs()
              host.onReady()
            } }),
            h(GlobalDialog),
            ready.value && host.panels.library && host.libraryTarget &&
              h(Teleport, { to: host.libraryTarget }, [h(tabs[host.panels.library].component, { key: host.panels.library })]),
            ready.value && host.panels.properties && host.propertiesTarget &&
              h(Teleport, { to: host.propertiesTarget }, [h(RightSidePanel)]),
            ready.value && host.panels.logs && host.logsTarget &&
              h(Teleport, { to: host.logsTarget }, [h(LogsTerminal)])
          ]
        })
      })
    }
  })
  vue.use(pinia).use(router).use(i18n)
  markStoresReady()
  app.extensionManager = useWorkspaceStore(pinia)
  registerExtensionDialogService(createExtensionDialogService())
  const detachLegacyUI = attachLegacyUI()
  void useBootstrapStore(pinia).startStoreBootstrap().catch(host.onError)
  vue.config.errorHandler = host.onError
  vue.mount(host.viewport)

  return {
    setCamera(camera: ComfyHost['camera']) {
      host.camera = camera
    },
    setOrder(order: Record<string, number>) {
      host.order = order
    },
    setPanels(panels: ComfyHost['panels']) {
      host.panels = panels
    },
    setPanelTargets(targets: Pick<ComfyHost, 'libraryTarget' | 'propertiesTarget' | 'logsTarget'>) {
      Object.assign(host, targets)
    },
    listNodes(query: string) {
      return useSearchBoxStore(pinia).listNativeNodes(query)
    },
    async listModels() {
      const store = useModelStore(pinia)
      await store.loadModels()
      return store.models.map(model => ({
        id: JSON.stringify([model.directory, model.file_name, model.path_index]),
        label: model.title,
        detail: model.directory
      }))
    },
    insertNode(id: string) {
      return useSearchBoxStore(pinia).insertNativeNode(id)
    },
    placeModel(id: string) {
      const model = useModelStore(pinia).models.find(model =>
        JSON.stringify([model.directory, model.file_name, model.path_index]) === id)
      if (!model) return false
      const provider = useModelToNodeStore(pinia).getNodeProvider(model.directory)
      if (!provider) return false
      startModelLoaderDrag(provider, model.file_name)
      return true
    },
    openPicker(point?: { x: number; y: number }) {
      const search = useSearchBoxStore(pinia)
      if (point) {
        const event = new PointerEvent('pointerdown', { clientX: point.x, clientY: point.y })
        app.canvas.adjustMouseEvent(event)
        search.openAt(event as Parameters<typeof search.openAt>[0])
      } else {
        search.openAt(null)
      }
    },
    closePicker() {
      useSearchBoxStore(pinia).visible = false
    },
    clearSelection() {
      app.canvas?.deselectAll()
    },
    importWorkflow: (data: unknown) => app.loadGraphData(data as Parameters<typeof app.loadGraphData>[0]),
    exportWorkflow: () => app.rootGraph.serialize(),
    exportPrompt: async () => (await app.graphToPrompt()).output,
    run: () => app.queuePrompt(0),
    moveNode(id: string, x: number, y: number) {
      const node = app.graph.getNodeById(toNodeId(id))
      if (!node) return
      node.pos = [x, y]
      app.graph.setDirtyCanvas(true, true)
      app.graph.change()
    },
    removeNode(id: string) {
      const node = app.graph.getNodeById(toNodeId(id))
      if (node) app.graph.remove(node)
    },
    dispose() {
      useNodeDragToCanvas().cancelDrag()
      useExecutionStore(pinia).unbindExecutionEvents()
      vue.unmount()
      detachLegacyUI()
      void nextTick(() => {
        if (comfyHost.value !== host) return
        app.canvas?.stopRendering()
        const socket = api.socket
        api.socket = null
        socket?.close()
        comfyHost.value = null
      })
    }
  }
}
