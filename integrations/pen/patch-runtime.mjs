// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

const SceneSetup = "let k=this._sceneManager,x=new xG(this._sceneManager);";
const SceneBridge = `${SceneSetup}window.__kronosPenScene=k;window.dispatchEvent(new Event("kronos-pen-scene-ready"));`;
const PaletteStart = "function(e){let t=[],a=new Set;for(let s of(0,T.DDD)()){";
const PaletteEnd = "return fr(e,t,a,g4.GX,T.LxM.AgentChat),t.sort((e,t)=>e.category-t.category),t}";
const PaletteComponent = "function fc({inputRef:e,setOpen:t}){";
const PreviewSubscription = 'd.eventEmitter.on("document-modified",e),()=>{d.eventEmitter.off("document-modified",e)}';
const PreviewBridge =
  'd.eventEmitter.on("document-modified",e),d.eventEmitter.on("kronos-widget-preview",e),()=>{d.eventEmitter.off("document-modified",e),d.eventEmitter.off("kronos-widget-preview",e)}';

const SlideFrameCheck = 'isSlideFrame(e){return"frame"===e.type&&e.parent===this.sceneManager.scenegraph.getViewportNode()}';
const WorkspaceSlideFrameCheck = SlideFrameCheck.replace(
  '"frame"===e.type',
  '"frame"===e.type&&e.properties.resolved.metadata?.type!=="kronos-live-widget"'
);

const ChatSupport = "let t=a1.i.isElectron||a1.i.isBrowser&&!e.isEmbed,[a]=(0,X.useState)(()=>t?new T.JbF";
const EmbeddedChatSupport = ChatSupport.replace(
  "!e.isEmbed",
  "(!e.isEmbed||new URLSearchParams(location.search).has('kronos-chat'))"
);

const AgentDispatch = "let g=u?this.effortByAgentType";
const AgentDispatchBridge = `if(window.__kronosSubmitAgent){e.remainingDesigns=void 0;window.__kronosSubmitAgent({prompt:n,files:a,conversationId:t,agentCount:i,designCount:s,parallelMode:h,iterateMode:l,skillNames:p},event=>this._handleSessionEvent(t,event));return}${AgentDispatch}`;
const NativeStop = "async stopConversation(e,t){if(this.isLoadingConversations)return;";
const ComposerSignIn = "if(!ty)return void tw(()=>tj.current());";
const SpotlightChildren = 'e.currentTarget.contains(e.relatedTarget)||O(!1)},children:[S&&z';
const MiniChatComponent = `function KronosMiniChat({manager,conversation,models}){
  const [rowStates]=(0,X.useState)(()=>new Map());
  return (0,D.jsx)("section",{
    "aria-label":"Mini chat",
    "data-kronos-mini-chat":true,
    className:"agent-chat-text absolute overflow-hidden rounded-3xl bg-island py-2 shadow-island island-shine",
    style:{bottom:"calc(100% + 6px)",left:"6%",right:"6%",height:"min(168px, 32vh)","--agent-text-scale":1},
    children:(0,D.jsxs)(D.Fragment,{children:[
      (0,D.jsx)("div",{"data-kronos-pen-workers":conversation.id}),
      (0,D.jsx)(uZ.Provider,{value:rowStates,children:(0,D.jsx)(u8.Provider,{
      value:manager,
      children:(0,D.jsx)(pP,{
        conversation,
        isVisible:true,
        runStartedAt:conversation.isRunning?manager.getRunStartedAt(conversation.id):void 0,
        agentType:conversation.modelID?(0,z.Yt9)(conversation.modelID).agentType:void 0,
        modelDisplayName:(0,un.$L)(conversation.pendingModelID??conversation.modelID,models),
        onQuestionSubmit:(id,response)=>manager.questionResponse(conversation.id,id,response),
        onPermissionResponse:(id,response)=>manager.permissionResponse(conversation.id,id,response),
        onSetWorkspaceFolder:()=>manager.changeWorkspaceFolder()
      })
    })})]})
  });
}`;

export function patchPenPresentationChat(source) {
  const flag = "tP=!ey&&!tm&&!tg;";
  if (!source.includes(flag)) return source;
  const replacements = [
    [flag, 'tP=!ey&&!tm&&!tg,kronosPresentChat=!!window.__kronosV2&&!!th?.currentSlide;'],
    ['(!tP||tT&&!j)&&"hidden",!F&&"invisible")}),as??', '(!tP&&!kronosPresentChat||tT&&!j)&&"hidden",!F&&"invisible")}),as??'],
    ['C&&tP&&(0,D.jsx)(xh,{onToggleDesignMode:tq,onToggleLayerList:tO,sidebarVisible:tr,', 'C&&(tP||kronosPresentChat)&&(0,D.jsx)(xh,{presentationChat:kronosPresentChat,onToggleDesignMode:tq,onToggleLayerList:tO,sidebarVisible:tr&&!kronosPresentChat,'],
    ['inputRef:t,sidebarVisible:tr,fullscreen:tU,agentPanelRequest:v', 'inputRef:t,sidebarVisible:tr&&!kronosPresentChat,fullscreen:tU&&!kronosPresentChat,agentPanelRequest:v'],
    ['chatFullscreen:tU,onChatSurfaceLiftedChange:tM', 'chatFullscreen:tU&&!kronosPresentChat,onChatSurfaceLiftedChange:tM'],
    ['"data-pencil-allow-canvas-clipboard":!0,children:[(0,D.jsx)("div",{"aria-hidden":"true",className:(0,e9.cn)("absolute inset-y-0 left-0 w-16', '"data-pencil-allow-canvas-clipboard":!0,hidden:e.presentationChat,children:[(0,D.jsx)("div",{"aria-hidden":"true",className:(0,e9.cn)("absolute inset-y-0 left-0 w-16'],
    ['"--left-panel-width":tr?"calc(var(--sidebar-width) + 8px)":"0px"', '"--left-panel-width":tr&&!kronosPresentChat?"calc(var(--sidebar-width) + 8px)":"0px"'],
    ['className:"absolute top-3 right-3 z-50 pointer-events-auto",children:(0,D.jsx)(to.m_,{side:"bottom",content:t,shortcut:"Esc"', '"data-kronos-pen-slide-control":true,className:"absolute top-3 right-3 z-50 pointer-events-auto",children:(0,D.jsx)(to.m_,{side:"bottom",content:t,shortcut:"Esc"'],
    ['className:"absolute bottom-3 right-3 z-50 flex items-center gap-1 pointer-events-auto",children:[(0,D.jsx)(to.m_,{side:"top",content:t', '"data-kronos-pen-slide-control":true,className:"absolute bottom-3 right-3 z-50 flex items-center gap-1 pointer-events-auto",children:[(0,D.jsx)(to.m_,{side:"top",content:t'],
    ['(0,D.jsxs)("div",{className:(0,e9.cn)("tools-panel relative flex flex-col gap-1 bg-island rounded-island island-shine p-1 shadow-island pointer-events-auto"),children:[c,', '(0,D.jsxs)("div",{"data-kronos-pen-primary-tools":true,className:(0,e9.cn)("tools-panel relative flex flex-col gap-1 bg-island rounded-island island-shine p-1 shadow-island pointer-events-auto"),children:[c,'],
  ];
  for (const [anchor, replacement] of replacements) {
    if (source.split(anchor).length !== 2) throw new Error("The Pen presentation chat markup changed.");
    source = source.replace(anchor, replacement);
  }
  return source;
}

export function patchPenMiniChat(source) {
  const spotlight = "function m6({chatManager:";
  if (!source.includes('"data-agent-spotlight":!0')) return source;
  if (source.includes("function KronosMiniChat(")) throw new Error("The Pen mini chat is already staged.");
  if (source.split(spotlight).length !== 2 || source.split(SpotlightChildren).length !== 2)
    throw new Error("The Pen spotlight composer changed; review this vendor version.");
  return source
    .replace(spotlight, () => MiniChatComponent + spotlight)
    .replace('{"data-chat-fullscreen":e.chatFullscreen||void 0', '{"data-kronos-chat-panel":true,"data-chat-fullscreen":e.chatFullscreen||void 0')
    .replace(SpotlightChildren, () =>
      SpotlightChildren.replace("children:[", 'children:[window.__kronosSubmitAgent&&!Z&&!z&&"bottom-center"===em&&A?.messages.length>0&&(0,D.jsx)(KronosMiniChat,{manager:e,conversation:A,models:N.allSupportedModels},A.id),')
    );
}

export function patchPenChatHistory(source) {
  const start = "function pz({conversations:";
  const end = "function pq({onClick:";
  if (!source.includes(start)) return source;
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  if (to < 0 || source.split(start).length !== 2)
    throw new Error("The Pen chat history component changed.");
  let history = source.slice(from, to);
  const replace = (anchor, replacement) => {
    if (history.split(anchor).length !== 2) throw new Error("The Pen chat history markup changed.");
    history = history.replace(anchor, () => replacement);
  };
  replace("layout:d=0})", "layout:d=0,hermesManager:kronosManager})");
  replace("[h,m]=(0,X.useState)(p?20:16);", "[h,m]=(0,X.useState)(p?20:16),[query,setQuery]=(0,X.useState)(''),term=query.trim().toLowerCase();");
  replace("let g=new Set;", `
    const [hermes,setHermes]=(0,X.useState)({rows:[]}),[opening,setOpening]=(0,X.useState)(false);
    const cancelOpen=(0,X.useRef)();
    (0,X.useEffect)(()=>()=>cancelOpen.current?.(),[]);
    (0,X.useEffect)(()=>{
      if(!kronosManager||!window.__kronosSearchSessions)return;
      let cancel;
      setHermes({rows:[],loading:true});
      const timer=setTimeout(()=>{cancel=window.__kronosSearchSessions(query.trim(),(rows,error)=>setHermes({rows:rows??[],error}));},term?200:0);
      return()=>{clearTimeout(timer);cancel?.();};
    },[kronosManager,query,term]);
    function openHermes(id){
      cancelOpen.current?.();
      setOpening(true);
      cancelOpen.current=window.__kronosOpenSession(id,result=>{
        setOpening(false);
        if(result.error){setHermes(value=>({...value,error:result.error}));return;}
        const key="hermes:"+id;
        const conversation=kronosManager.conversations.get(key)??kronosManager.createNewConversation(key);
        if(!conversation.isRunning){
          conversation.title=result.title;
          conversation.messages=result.messages;
          kronosManager.conversations.set(key,conversation);
        }
        s(key);
      });
    }
    let g=new Set;
  `);
  replace("for(let e of t)(0,T.acD)(e)>0", "for(let e of t)!e.id.startsWith(\"hermes:\")&&(0,T.acD)(e)>0&&(!term||pT(c,e).toLowerCase().includes(term))");
  const list = '(0,D.jsxs)("div",{ref:u,className:';
  const tools = [
    ["skills", "Capabilities", "M8 2l1.5 4.5L14 8l-4.5 1.5L8 14l-1.5-4.5L2 8l4.5-1.5z"],
    ["messaging", "Messaging", "M2 3h12v8H7l-3 3v-3H2z"],
    ["artifacts", "Artifacts", "M5 2h5l3 3v9H5z M3 5v8 M10 2v4h3"],
    ["workflows", "Workflows", "M4 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4z M4 6v8 M6 8h6v4"],
    ["cron", "Scheduled jobs", "M6 2h4l1 3v6l-1 3H6l-1-3V5z M8 6v2l2 1"],
    ["bots", "Bot mode", "M3 5h10v8H3z M8 2v3 M6 8h.01 M10 8h.01 M6 11h4"],
    ["rooms", "Project rooms", "M2 3h9v6H6l-3 2V9H2z M7 11h4l3 2V6"],
  ];
  replace(list, `window.__kronosOpenHistoryTool&&(0,D.jsx)("nav",{
    "aria-label":"KronOS tools",
    className:"shrink-0 max-h-[32vh] overflow-y-auto px-2.5 pt-1",
    children:${JSON.stringify(tools)}.map(([id,label,path])=>(0,D.jsxs)("button",{
      type:"button",
      className:"flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] text-foreground/80 hover:bg-black/5 dark:hover:bg-white/10 focus-visible:ring-[3px] focus-visible:ring-ring/50",
      onClick:()=>window.__kronosOpenHistoryTool(id),
      children:[(0,D.jsx)("svg",{"aria-hidden":true,className:"size-3.5 shrink-0 opacity-70",viewBox:"0 0 16 16",fill:"none",stroke:"currentColor",strokeLinecap:"round",strokeLinejoin:"round",children:(0,D.jsx)("path",{d:path})}),label]
    },id))
  }),window.__kronosSubmitAgent&&(0,D.jsx)("div",{className:"px-2.5 py-2",children:(0,D.jsx)("input",{
    type:"search",
    "aria-label":"Search chats",
    placeholder:"Search chats…",
    className:"w-full rounded-md border border-zinc-200 bg-transparent px-2.5 py-1 text-[13px] text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:border-zinc-700/50",
    value:query,
    maxLength:200,
    onChange:event=>setQuery(event.target.value)
  })}),${list}`);
  replace("children:[pL.map", `children:[
    hermes.error&&(0,D.jsx)("div",{role:"status",className:"px-2.5 py-2 text-[13px] text-foreground/70",children:hermes.error}),
    (hermes.loading||opening)&&(0,D.jsx)("div",{role:"status",className:"px-2.5 py-2 text-[13px] text-foreground/50",children:opening?"Opening chat…":"Loading sessions…"}),
    term&&!x&&!hermes.rows.length&&!hermes.loading&&!hermes.error&&(0,D.jsx)("div",{className:"px-2.5 py-2 text-[13px] text-foreground/50",children:"No matching chats"}),
    hermes.rows.length>0&&(0,D.jsxs)("section",{className:"mb-2",children:[
      (0,D.jsx)("h3",{className:"px-2.5 pt-1 pb-1 text-xxs font-semibold text-foreground/40",children:"Kron Agent sessions"}),
      (0,D.jsx)("div",{role:"listbox","aria-label":"Kron Agent sessions",className:"flex flex-col gap-0.5",children:hermes.rows.map(({id,title})=>
        (0,D.jsx)("button",{type:"button",role:"option","data-conversation-row":true,"aria-selected":a==="hermes:"+id,
          className:(0,e9.cn)("flex h-8 w-full min-w-0 items-center rounded-md px-2.5 text-left text-[13px] text-foreground/80 outline-none hover:bg-zinc-100 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:hover:bg-zinc-700/30",a==="hermes:"+id&&"bg-zinc-100 text-foreground dark:bg-zinc-700/50"),
          onClick:()=>openHermes(id),children:(0,D.jsx)("span",{className:"truncate",children:title})
        },id)
      )})
    ]}),
    pL.map`);
  replace('x>0&&(!p||!v)', 'window.__kronosSubmitAgent&&!term&&(0,D.jsx)("div",{"data-kronos-pen-history-extras":true,ref:element=>{if(element)element.kronosOpenTelegram=result=>{const key="hermes:"+result.sessionId;const chat=kronosManager.conversations.get(key)??kronosManager.createNewConversation(key);if(!chat.isRunning){chat.title=result.title;chat.messages=result.messages;kronosManager.conversations.set(key,chat);}s(key);};}}),x>0&&(!p||!v)');
  const historyTail = ']})]})}';
  if (!history.endsWith(historyTail)) throw new Error("The Pen history footer changed.");
  history = history.slice(0, -historyTail.length) +
    '] }),window.__kronosSubmitAgent&&(0,D.jsx)("div",{"data-kronos-pen-profile-footer":true})]})}';
  // The native confirmation threshold counts all chats, so hide Clear history while filtering.
  replace("x>0&&(!p||!v)", "!term&&x>0&&(!p||!v)");
  const result = source.slice(0,from)+history+source.slice(to);
  const component = "(0,D.jsx)(pz,{";
  if (result.split(component).length !== 3) throw new Error("The Pen chat history entry points changed.");
  return result.replaceAll(component, component + "hermesManager:a,");
}

function patchPenSpotlightDrag(source) {
  const composer = 'onMouseLeave:ep.onMouseLeave,children:[ey&&';
  if (!source.includes(composer)) return source;
  const geometry = 'd.set({left:a.left-s.left,clearance:s.bottom-a.top+8})';
  const observer = 'r.observe(e,{attributes:!0,attributeFilter:["style"]})';
  if ([composer, geometry, observer].some((anchor) => source.split(anchor).length !== 2))
    throw new Error("The Pen spotlight drag anchors changed.");
  return source
    .replace(composer, 'onMouseLeave:ep.onMouseLeave,children:[window.__kronosSubmitAgent&&!Z&&!z&&"bottom-center"===em&&(0,D.jsx)("button",{type:"button","data-kronos-pen-drag-chat":true,"aria-label":"Drag chat to detach or dock",title:"Drag to move chat. Double-click to dock.",children:(0,D.jsx)("span",{"aria-hidden":true})}),ey&&')
    .replace(geometry, 'd.set(e.hasAttribute("data-kronos-floating-chat")?void 0:{left:a.left-s.left,clearance:s.bottom-a.top+8})')
    .replace(observer, 'r.observe(e,{attributes:!0,attributeFilter:["style","data-kronos-floating-chat"]})');
}

function patchPenComposerControls(source) {
  const props = 'statusIndicator:U,agentMultiplier:H';
  if (!source.includes(props)) return source;
  const toolbar = 'children:[(0,s.jsxs)(Z,{open:eM,onOpenChange:e_';
  const input = 'input:ac?ap:void 0,inputRef:ei,editorRef:er,';
  const fallback = 'children:[(0,D.jsx)("textarea",{ref:k,rows:1,className:"block field-sizing-content';
  if ([props, toolbar, input, fallback].some((anchor) => source.split(anchor).length !== 2))
    throw new Error("The Pen composer controls changed.");
  const resume = 'resume:result=>{const key="hermes:"+result.sessionId;const chat=e.conversations.get(key)??e.createNewConversation(key);if(!chat.isRunning){chat.title=result.title;chat.messages=result.messages;e.conversations.set(key,chat);}e.selectConversation(key);},';
  return source
    .replace(props, 'kronosControls:kronosControls,statusIndicator:U,agentMultiplier:H')
    .replace(toolbar, 'children:[window.__kronosSubmitAgent&&kronosControls?.id&&(0,s.jsx)("div",{"data-kronos-pen-composer-controls":kronosControls.id,ref:element=>{if(element)element.kronosControls=kronosControls;}}),(0,s.jsxs)(Z,{open:eM,onOpenChange:e_')
    .replace(input, input + `kronosControls:{
      id:a,
      ${resume}
      insert:text=>er.current?.chain().focus().insertContent({type:"text",text}).run(),
      send:text=>{const {agentMultiplier,parallelMode,agentModels}=eG(e,{parallelMode:tx,parallelAgentModels:tf});tk.current({text,agentMultiplier,parallelMode,agentModels,designCount:tF,iterateMode:tA,skillNames:(0,r.nUe)(text)});tI(1);},
      draft:()=>{const editor=er.current;if(!editor?.isFocused||!editor.state.selection.empty)return;const {$from,from}=editor.state.selection;return {before:$from.parent.textBetween(0,$from.parentOffset,"\\n"," "),end:from,first:$from.start()===1};},
      replace:(from,to,text)=>er.current?.chain().focus().insertContentAt({from,to},{type:"text",text}).run(),
      stop:$
    },`)
    .replace(fallback, `children:[window.__kronosSubmitAgent&&I&&(0,D.jsx)("div",{
      "data-kronos-pen-composer-controls":I,
      ref:element=>{if(element)element.kronosControls={
        ${resume}
        insert:text=>{const input=k.current;if(input){input.setRangeText(text,input.selectionStart,input.selectionEnd,"end");K(!!input.value.trim());input.focus();}},
        draft:()=>{const input=k.current;if(input===document.activeElement&&input.selectionStart===input.selectionEnd)return {before:input.value.slice(0,input.selectionStart),end:input.selectionStart,first:true};},
        replace:(from,to,text)=>{const input=k.current;if(input){input.setRangeText(text,from,to,"end");K(!!input.value.trim());input.focus();}},
        send:text=>e?.sendMessage({prompt:text,conversationId:I}),
        stop:()=>e?.stopConversation(I)
      };}
    }),(0,D.jsx)("textarea",{ref:k,rows:1,className:"block field-sizing-content`);
}

function patchPenWorkerSlot(source) {
  const anchor = 'e({chatManager:a,agentConfig:F,activeConversationId:_,';
  if (!source.includes(anchor)) return source;
  if (source.split(anchor).length !== 2) throw new Error("The Pen chat composer slot changed.");
  return source.replace(anchor, 'window.__kronosSubmitAgent&&_&&(0,D.jsx)("div",{"data-kronos-pen-workers":_}),' + anchor);
}

export function patchPenLibraryTabs(source) {
  const start = "function p9({isVisible:";
  const end = "function he({fullscreen:";
  if (!source.includes(start)) return source;
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  if (to < 0 || source.split(start).length !== 2) throw new Error("The Pen sidebar component changed.");
  let sidebar = source.slice(from, to);
  const replace = (anchor, replacement) => {
    if (sidebar.split(anchor).length !== 2) throw new Error("The Pen sidebar tabs changed.");
    sidebar = sidebar.replace(anchor, () => replacement);
  };
  const tab = (name, path) =>
    `{value:"${name}",label:"${name}",icon:(0,D.jsx)("svg",{className:"size-[15px]","aria-hidden":true,viewBox:"0 0 16 16",fill:"none",stroke:"currentColor",strokeLinecap:"round",strokeLinejoin:"round",children:(0,D.jsx)("path",{d:"${path}"})})}`;
  const bots = tab("Bots", "M3 5h10v8H3z M8 2v3 M6 8h.01 M10 8h.01 M6 11h4");
  const tabs = [
    tab("KronFlow", "M2 2h4v4H2z M10 10h4v4h-4z M4 6v6h6"),
    tab("KronRender", "M2.5 3.5h11v9h-11z M3 11l3-3 2 2 2.5-3 3 3"),
  ];
  replace('(0,D.jsx)(cQ.A,{className:"size-[15px]"})}]}',
    `(0,D.jsx)(cQ.A,{className:"size-[15px]"})},...(new URLSearchParams(location.search).has("kronos-chat")?[${tabs.join(",")}]:[])]}`);
  const primary = 'isLabelDefault:!0}]:[],tabs:';
  replace(primary, `isLabelDefault:!0},...(new URLSearchParams(location.search).has("kronos-chat")?[${bots}]:[])]:[],tabs:`);
  const librarySelected = 'I==="KronFlow"||I==="KronRender"||I==="Bots"';
  replace('children:v.formatMessage("Layers"===I', `children:${librarySelected}?I:v.formatMessage("Layers"===I`);
  replace('children:"Layers"===I?', `children:${librarySelected}?(0,D.jsx)("div",{
    "data-kronos-pen-library-panel":I,
    className:"h-full overflow-y-auto",
    ref:element=>{
      if(!element||I!=="Bots")return;
      element.kronosOpenBotChat=result=>{
        if(!o||o.isLoadingConversations)return;
        const key="hermes:"+result.sessionId;
        const chat=o.conversations.get(key)??o.createNewConversation(key);
        if(!chat.isRunning){
          chat.title=result.title;
          chat.messages=result.messages;
          o.conversations.set(key,chat);
        }
        o.selectConversation(key);
        P("Agent");
      };
    }
  }):"Layers"===I?`);
  return source.slice(0, from) + sidebar + source.slice(to);
}

function patchPenWorkspaceDashboard(source) {
  const sections = 'D=i?eT:eR,[L,T]';
  if (!source.includes(sections)) return source;
  const filter = 'let e=t.kinds.includes(a.kind),r=a.timestamps?.lastOpenedAt';
  const dashboardState = '[e6,e7]=(0,X.useState)(),te=';
  const dashboardHook = '(0,h.useEffect)(()=>{if(0===k.status)';
  if ([sections, filter, dashboardState, dashboardHook].some((anchor) => source.split(anchor).length !== 2))
    throw new Error("The Pen dashboard sections changed.");
  return source
    .replace(sections, 'D=(0,h.useMemo)(()=>new URLSearchParams(location.search).has("kronos-chat")?[...(i?eT:eR),{title:{id:"dashboard.sections.kronosWorkspaces",defaultMessage:"Workspaces"},kinds:[l.sOp.Managed,l.sOp.File],openedOnly:false,sorted:true,removals:[],kronosWorkspace:true}]:i?eT:eR,[i]),[L,T]')
    .replace(dashboardState, '[e6,e7]=(0,X.useState)(),kronosDashboard=(0,X.useEffect)(()=>{const open=()=>{window.__kronosWorkspaceRequested=true;e4(true);window.dispatchEvent(new Event("kronos-pen-workspaces"));};window.__kronosOpenWorkspaces=open;return()=>{if(window.__kronosOpenWorkspaces===open)delete window.__kronosOpenWorkspaces;};},[]),te=')
    .replace(dashboardHook, '(0,h.useEffect)(()=>{const open=()=>{if(!window.__kronosWorkspaceRequested)return;const section=D.find(item=>item.kronosWorkspace);if(section){window.__kronosWorkspaceRequested=false;T(section);E(eq);}};open();window.addEventListener("kronos-pen-workspaces",open);return()=>window.removeEventListener("kronos-pen-workspaces",open);},[D]),' + dashboardHook)
    .replace(filter, 'let e=t.kinds.includes(a.kind)&&!!a.kronosWorkspace===!!t.kronosWorkspace,r=a.timestamps?.lastOpenedAt');
}

function patchPenInspectorSlot(source) {
  const start = 'l=ra(),d=rt(),c=(0,X.useMemo)';
  if (!source.includes(start)) return source;
  const body = 'if(0===d)return null;let p=[];for(let e of r)p.push((0,D.jsx)(cH,{section:e},e.name));return(0,D.jsx)(cz,{layout:i,className:e,';
  const panelState = 'c=(0,X.useMemo)(()=>({isCollapsed:t,setIsCollapsed:a,onToggleBrowserView:s}),[t,a,s]),u=1;switch(t?u=0:';
  const fold = 'defaultMessage:"Hide panel"}),onClick:()=>a?.(!t)';
  if ([start, body, fold, panelState, 'className:"text-xxs",children:p'].some((anchor) => source.split(anchor).length !== 2))
    throw new Error("The Pen properties panel changed.");
  return source
    .replace(fold, 'defaultMessage:"Hide panel"}),onClick:()=>window.__kronosInspectorOpen?window.__kronosCloseInspector?.():a?.(!t)')
    .replace(start, 'l=ra(),d=rt(),kronosInspector=(0,X.useSyncExternalStore)(listener=>{window.addEventListener("kronos-pen-inspector",listener);return()=>window.removeEventListener("kronos-pen-inspector",listener);},()=>window.__kronosInspectorOpen),c=(0,X.useMemo)')
    .replace(panelState, 'collapsed=kronosInspector?false:t,c=(0,X.useMemo)(()=>({isCollapsed:collapsed,setIsCollapsed:a,onToggleBrowserView:s}),[collapsed,a,s]),u=1;switch(collapsed?u=0:')
    .replace(body, 'if(kronosInspector===false||(!d&&!kronosInspector))return null;let p=[];if(d)for(let e of r)p.push((0,D.jsx)(cH,{section:e},e.name));return(0,D.jsx)(cz,{layout:kronosInspector?0:i,className:(0,e9.cn)(e,kronosInspector&&!d&&"kronos-pen-empty-inspector"),')
    .replace('className:"text-xxs",children:p', `className:"text-xxs",children:kronosInspector?[
      p[0]??(0,D.jsx)("div",{className:"py-2 pl-3 pr-3.5 min-h-10 flex items-center justify-between",children:["Workspace",(0,D.jsx)(lO,{})]},"header"),
      (0,D.jsx)("div",{"data-kronos-pen-inspector-slot":true},"kronos-inspector"),
      ...p.slice(1)
    ]:p`);
}

export function patchPenGoodies(source) {
  const dialog = 'function Q({title:e,initialSection:t="featured"}={})';
  const paste = "async pasteDataTransfer(e,t){";
  if (source.includes(dialog)) {
    const assetBase = "function l(){return window.vscodeapi?";
    const template = 'L=(0,p.useCallback)(e=>{o.vF5.debug(`Goodies design system: ${e.id}`),';
    for (const anchor of [dialog, assetBase, template]) {
      if (source.split(anchor).length !== 2) throw new Error("The Pen Goodies dialog changed.");
    }
    return source
      .replace(assetBase, 'function l(){if(window.__kronosV2)return "./";return window.vscodeapi?')
      .replaceAll("goodies./images/", "goodies/images/")
      .replace(template, () => template.replace("(e=>{", `(async e=>{
        if(window.__kronosV2){
          try{
            if(e.id==="new"){await d.request("documents-new");m();return;}
            if(!["shadcn","lunaris","halo","nitro","demo","heroui"].includes(e.id))throw Error("Unknown design system");
            const response=await fetch("./goodies/templates/pencil-"+e.id+".pen");
            if(!response.ok)throw Error("Design system could not be loaded");
            await y.selectionManager.pasteKronosTemplate(await response.text(),response.url);
            m();
          }catch(error){
            o.vF5.error("Failed to insert design system:",error);
            g.oR.error(a.formatMessage({id:"goodies.toast.insertFailed",defaultMessage:"Failed to insert {name}"},{name:e.name}));
          }
          return;
        }
      `))
      .replace('[m,d,u]),T=(0,p.useCallback)(async e=>{let t={type:"style"', '[m,d,u,a,y]),T=(0,p.useCallback)(async e=>{let t={type:"style"');
  }
  if (!source.includes(paste)) return source;
  if (source.split(paste).length !== 2 || !source.includes("function s3(e,t){"))
    throw new Error("The Pen paste implementation changed.");
  return source.replace(paste, `async pasteKronosTemplate(content,url){
    const graph=this.sm.scenegraph;
    const temporary=graph.beginUpdate();
    if(!temporary)throw Error("The canvas is not ready");
    let clipboard;
    try{
      const documents=this.sm.documentManager;
      const id=documents.createDocumentID();
      await this.sm.fileManager.loadContent(temporary,content,e5.rz$.from(url),id);
      clipboard=s4(documents.documents.get(id).root.children,this.sm,void 0,{includeLocalData:false});
      delete clipboard.sourceURI;
    }finally{
      graph.rollbackBlock(temporary);
    }
    const data=new DataTransfer();
    data.setData("text/html",s3(clipboard));
    const update=graph.beginUpdate();
    if(!update)throw Error("The canvas is not ready");
    let decoded;
    try{
      decoded=await this.decodeClipboardNodes(data,update);
      if(!decoded?.nodes.length)throw Error("Design system contains no insertable layers");
      const bounds=sh.calculateCombinedBoundsFromArray(decoded.nodes);
      if(!bounds)throw Error("Design system has no canvas bounds");
      const {camera}=this.sm;
      for(const node of decoded.nodes){
        const transform=node.getWorldMatrix().clone();
        transform.translate(camera.centerX-bounds.centerX,camera.centerY-bounds.centerY);
        node.setWorldTransform(update,transform);
      }
      graph.commitBlock(update,{undo:true});
    }catch(error){
      graph.rollbackBlock(update);
      throw error;
    }
    const selection=new Set(decoded.nodes);
    this.setSelection(selection);
    const insertedBounds=sh.calculateCombinedBoundsNew(selection);
    if(insertedBounds)this.sm.camera.ensureVisible(insertedBounds,{animate:true});
  }${paste}`);
}

export function patchPenRuntime(source) {
  let patched = false;
  let commandsPatched = false;
  let previewsPatched = false;
  let slidesPatched = false;
  let agentDispatchPatched = false;
  let agentComposerPatched = false;
  if (source.includes(SceneSetup)) {
    if (source.split(SceneSetup).length !== 2)
      throw new Error("The Pen scene setup is ambiguous; review the vendor bridge.");
    if (source.includes("window.__kronosPenScene="))
      throw new Error("Stage the original Pen runtime, not an already patched copy.");
    source = source.replace(SceneSetup, SceneBridge);
    patched = true;
  }
  if (source.includes(PaletteComponent)) {
    if (source.includes("window.__kronosPenCommands="))
      throw new Error("Stage the original Pen runtime, not an already patched commands copy.");
    if (
      source.split(PaletteStart).length !== 2 ||
      source.split(PaletteComponent).length !== 2 ||
      source.split(PaletteEnd).length !== 2
    )
      throw new Error("The Pen command catalog changed or is ambiguous; review this vendor version.");
    if (source.split(ChatSupport).length !== 2)
      throw new Error("The Pen chat initialization changed; review this vendor version.");
    source = source.replace(ChatSupport, EmbeddedChatSupport);
    source = source.replace('[tv,ty]=(0,X.useState)("Agent")', '[tv,ty]=(0,X.useState)("Layers")');
    const start = source.indexOf(PaletteStart);
    const end = source.indexOf(PaletteEnd, start) + PaletteEnd.length;
    const catalog = source.slice(start, end);
    const bridge = `window.__kronosPenCommands={entries:()=>(${catalog})((0,L.UX)()),isOffered:g7,availability:g9,label:(scene,entry)=>entry.kind===0?(0,L.UX)().formatMessage(scene.actions.getLabel(entry.action)):entry.label,shortcut:entry=>entry.kind===0?(0,T.l94)(entry.action):void 0,formatMessage:message=>(0,L.UX)().formatMessage(message)};`;
    source = source.replace(PaletteComponent, bridge + PaletteComponent);
    commandsPatched = true;
  }
  if (source.includes(AgentDispatch)) {
    if (source.split(AgentDispatch).length !== 2) throw new Error("The Pen agent dispatch changed.");
    const nativeParallel = 'if(n&&!o&&(f.pendingModelID=n),o||(f.prompt=e,f.files=a),!o&&"side-by-side"===m)';
    if (source.split(nativeParallel).length !== 2) throw new Error("The Pen parallel run handler changed.");
    if (source.split(NativeStop).length !== 2) throw new Error("The Pen agent stop handler changed.");
    const save = "saveConversation(e){";
    const clear = "for(let[e,t]of this.conversations)t.isRunning&&this.stopConversation(e),this.deleteConversation(e);";
    if (source.split(clear).length !== 2) throw new Error("The Pen clear history handler changed.");
    if (source.split(save).length !== 2) throw new Error("The Pen conversation save handler changed.");
    source = source
      .replace(save, save + 'if(e.startsWith("hermes:"))return;')
      .replace(clear, clear.replace(")t.isRunning", ')if(!e.startsWith("hermes:"))t.isRunning'))
      .replace(nativeParallel, nativeParallel.replace('!o&&"side-by-side"', '!window.__kronosSubmitAgent&&!o&&"side-by-side"'))
      .replace(AgentDispatch, AgentDispatchBridge)
      .replace(NativeStop, `${NativeStop}if(window.__kronosStopAgent?.(e))return;`);
    agentDispatchPatched = true;
  }
  if (source.includes(ComposerSignIn)) {
    if (source.split(ComposerSignIn).length !== 2) throw new Error("The Pen composer submission changed.");
    const limit = "maxParallelAgents:g=eT,";
    const models = '"side-by-side"===Y&&H>1&&';
    const parallelField = 'disabled:E||!n,className:"min-w-0 space-y-2';
    if ([limit, models, parallelField].some((anchor) => source.split(anchor).length !== 2))
      throw new Error("The Pen run settings changed.");
    source = source
      .replace(limit, 'maxParallelAgents:kronosPlanLimit=eT,')
      .replace('className:X},Z){let J=', 'className:X},Z){const g=window.__kronosSubmitAgent?eT:kronosPlanLimit;let J=')
      .replace(models, '!window.__kronosSubmitAgent&&' + models)
      .replace(parallelField, 'disabled:window.__kronosSubmitAgent?!!E:E||!n,className:"min-w-0 space-y-2')
      .replace(ComposerSignIn, ComposerSignIn.replace("!ty", "!ty&&!window.__kronosSubmitAgent"))
      .replace("if(!t||e.agentConfig.modelsLoading)", "if(!t||e.agentConfig.modelsLoading&&!window.__kronosSubmitAgent)")
      .replace("canSendMessage:p,modelsLoading:!p", "canSendMessage:!!window.__kronosSubmitAgent||p,modelsLoading:!window.__kronosSubmitAgent&&!p");
    agentComposerPatched = true;
  }
  if (source.includes(PreviewSubscription)) {
    if (source.split(PreviewSubscription).length !== 2)
      throw new Error("The Pen slide preview subscription is ambiguous; review this vendor version.");
    source = source.replace(PreviewSubscription, PreviewBridge);
    previewsPatched = true;
  }
  if (source.includes(SlideFrameCheck)) {
    if (source.split(SlideFrameCheck).length !== 2)
      throw new Error("The Pen slide frame check is ambiguous; review this vendor version.");
    source = source.replace(SlideFrameCheck, WorkspaceSlideFrameCheck);
    slidesPatched = true;
  }
  const withMiniChat = patchPenMiniChat(source);
  const withChatHistory = patchPenChatHistory(withMiniChat);
  const withWorkerSlot = patchPenComposerControls(patchPenWorkerSlot(patchPenSpotlightDrag(withChatHistory)));
  const withLibraryTabs = patchPenLibraryTabs(withWorkerSlot);
  const withWorkspaces = patchPenPresentationChat(patchPenInspectorSlot(patchPenWorkspaceDashboard(withLibraryTabs)));
  const withGoodies = patchPenGoodies(withWorkspaces);
  return { source: withGoodies, goodiesPatched: withGoodies !== withWorkspaces, workspaceDashboardPatched: withWorkspaces !== withLibraryTabs, libraryTabsPatched: withLibraryTabs !== withWorkerSlot, chatHistoryPatched: withChatHistory !== withMiniChat, patched, commandsPatched, previewsPatched, slidesPatched, agentDispatchPatched, agentComposerPatched, miniChatPatched: withMiniChat !== source };
}
