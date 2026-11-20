import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Activity, ArrowLeft, ArrowRight, ArrowUp, Bookmark, Check, ChevronDown, Command, FileText, Folder, Globe, Layers, Link, MessageSquare, MoreHorizontal, PanelRight, Plus, Search, Settings, Terminal, X } from "lucide-react";
import "./preview.css";

const sources = [
    { title: "IANA", subtitle: "Reserved domains", url: "https://www.iana.org/domains/reserved" },
    { title: "RFC 2606", subtitle: "Reserved Top Level DNS Names", url: "https://www.rfc-editor.org/rfc/rfc2606.html" },
];
const findings = [
    ["IANA manages example domains for documentation. These domains are unavailable for registration or transfer.", [1]],
    ["RFC 2606 reserves .test, .example, .invalid, and .localhost for distinct purposes.", [2]],
    ["The IANA overview explains administration, while RFC 2606 describes the rationale for safe testing and documentation names.", [1, 2]],
];

function App() {
    const [view, setView] = useState("Browser");
    const [source, setSource] = useState(0);
    const [agent, setAgent] = useState(true);
    const [draft, setDraft] = useState("");
    const [messages, setMessages] = useState([{ role: "user", text: "Compare these sources and keep a brief." }, { role: "agent", text: "The comparison is saved with links to both pages. You can open it on Canvas or keep working here." }]);
    const [activity, setActivity] = useState(false);
    const [sourceChips, setSourceChips] = useState([0, 1]);
    const [inspector, setInspector] = useState("Document");
    const [bookmarked, setBookmarked] = useState(false);
    const [toast, setToast] = useState("");
    const [notes, setNotes] = useState(["Keep citations connected to their original tabs."]);
    const [search, setSearch] = useState("");
    const [palette, setPalette] = useState(false);
    const [project, setProject] = useState("Browser redesign");
    const [section, setSection] = useState("Recent");
    const [busy, setBusy] = useState(false);
    const current = sources[source];

    function notice(text) { setToast(text); window.setTimeout(() => setToast(""), 2800); }
    function openSource(index) { setSource(index); setView("Browser"); }
    function exportBrief() {
        const body = "# Reserved domains comparison\n\n" + findings.map(([text, ids]) => text + " " + ids.map(id => "[" + id + "]").join(" ")).join("\n\n") + "\n\n" + sources.map((item, i) => "[" + (i + 1) + "] " + item.url).join("\n");
        const url = URL.createObjectURL(new Blob([body], { type: "text/markdown" }));
        const a = document.createElement("a"); a.href = url; a.download = "comparison.md"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        notice("comparison.md exported");
    }
    function send(e) {
        e.preventDefault(); if (!draft.trim() || busy) return;
        const text = draft.trim(); setDraft(""); setMessages(items => [...items, { role: "user", text }]); setBusy(true);
        setTimeout(() => {
            setMessages(items => [...items, { role: "agent", text: /canvas|brief|save/i.test(text) ? "The sample brief is ready on Canvas, with both sources linked. Open it below to inspect the citations." : "This preview keeps the conversation beside your work. You can switch views, inspect sources, and add notes without losing the chat." }]);
            setBusy(false);
        }, 650);
    }
    const iconButton = (label, Icon, action) => <button className="icon" title={label} aria-label={label} onClick={action}><Icon size={17}/></button>;
    const citations = ids => ids.map(id => <button className="citation" title={"Open " + sources[id-1].title} key={id} onClick={() => openSource(id-1)}>[{id}]</button>);

    return <div className="app" onKeyDown={e => { if (e.key === "Escape") setPalette(false); if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setPalette(!palette); } }}>
        <header className="shell">
            <button className="brand" onClick={() => setView("Space")}><span className="logo"><Layers size={19}/></span>KronOS <span className="version">v2</span></button>
            <button className="project" onClick={() => setView("Space")}><Folder size={16}/><span>{project}</span><ChevronDown size={13}/></button>
            <nav aria-label="Workspace views">{["Browser", "Files", "Canvas", "Terminal"].map(name => <button key={name} className={view === name ? "selected" : ""} onClick={() => setView(name)}>{React.createElement({ Browser: Globe, Files: Folder, Canvas: Layers, Terminal }[name], {size:16})}<span>{name}</span></button>)}</nav>
            <div className="shell-end">{iconButton("Command center", Search, () => setPalette(true))}<button className={activity ? "selected" : ""} onClick={() => setActivity(!activity)}><Activity size={16}/><span>Activity</span></button><button className={agent ? "selected" : ""} onClick={() => setAgent(!agent)}><MessageSquare size={16}/><span>Agent</span><i/></button></div>
        </header>
        <div className="body">
            <aside className="rail">
                <div className="rail-heading">Workspace</div>
                <button className={view === "Space" ? "active" : ""} onClick={() => setView("Space")}><Folder size={16}/>{project}</button>
                <div className="rail-heading spread">Sources <button className="mini" onClick={() => { setPalette(true); setSearch("source"); }}><Plus size={14}/></button></div>
                {sources.map((item, i) => <button className={view === "Browser" && source === i ? "active" : ""} key={item.title} onClick={() => openSource(i)}>{i ? <FileText size={16}/> : <Globe size={16}/>}<span>{item.title}</span>{i === source && view === "Browser" && <span className="dot"/>}</button>)}
                <button onClick={() => { setView("Canvas"); setInspector("Notes"); }}><FileText size={16}/>Notes</button>
                <hr/><div className="rail-heading">Build</div>
                <button onClick={() => { setView("Terminal"); }}><Terminal size={16}/>Terminal</button>
                <button onClick={() => { setView("Files"); }}><Folder size={16}/>Project files</button>
                <button onClick={() => { setView("Space"); setSection("Collections"); }}><Bookmark size={16}/>Collections</button>
                <div className="rail-bottom"><button className="file-card" onClick={() => { setView("Canvas"); setInspector("Document"); }}><FileText size={19}/><span><strong>comparison.md</strong><small>2 sources · saved locally</small></span></button><div className="rail-footer">{iconButton("Preview information", Settings, () => notice("Interactive concept · sample content · no live agent"))}<span>Concept preview</span><kbd>⌘ K</kbd></div></div>
            </aside>
            <main>
            {view === "Browser" && <>
                <div className="browser-bar">{iconButton("Previous source", ArrowLeft, () => openSource(0))}{iconButton("Next source", ArrowRight, () => openSource(1))}
                    <div className="address"><Globe size={14}/><span>{current.url}</span>{iconButton(bookmarked ? "Remove bookmark" : "Bookmark source", Bookmark, () => { setBookmarked(!bookmarked); notice(bookmarked ? "Bookmark removed" : "Source bookmarked"); })}</div>
                    {iconButton("Open original source", ArrowUp, () => window.open(current.url, "_blank", "noopener,noreferrer"))}
                </div>
                <div className="article-scroll"><article className="article">
                    <div className="site-heading">{current.title}<span>{source === 0 ? "Internet Assigned Numbers Authority" : "Request for Comments"}</span></div>
                    <p className="breadcrumb">Home / Domains / {current.subtitle}</p><h1>{current.subtitle}</h1>
                    <p className="lead">{source === 0 ? "Some domain names are reserved for documentation, testing, and other specific purposes." : "A small set of names is reserved to make testing and documentation safer."}</p>
                    <div className="article-label">Sample reading view</div>
                    {source === 0 ? <>
                        <h2>Example domains</h2><p>IANA maintains example.com and example.org for illustrative use in documentation. They are available for this purpose without prior coordination.</p>
                        <p className="highlight">These domains are unavailable for registration or transfer. Keep the original source attached when using this material in a brief.</p>
                        <h2>Related references</h2><p>RFC 2606 describes reserved top-level names and reserved second-level example domains. Its purpose is to reduce conflicts between test or example names and operational DNS.</p>
                    </> : <>
                        <h2>Reserved top-level names</h2><div className="domain-table">{[[".test","Testing DNS-related code"],[".example","Documentation and examples"],[".invalid","Names intended to be clearly invalid"],[".localhost","Loopback use"]].map(([a,b])=><div key={a}><code>{a}</code><span>{b}</span></div>)}</div>
                        <h2>Why reserve names?</h2><p>Documentation examples and test code can reach operational DNS. Reserved names help reduce conflicts with existing or future domain names.</p>
                    </>}
                    <div className="article-action"><Link size={15}/><span>Source attached to <strong>comparison.md</strong></span><button onClick={() => { setView("Canvas"); setInspector("Document"); }}>Open on Canvas <ArrowRight size={14}/></button></div>
                    <button className="selection-action" onClick={() => { setNotes(items => [...items, source === 0 ? "Example domains can be used in documentation without prior coordination. [1]" : "Reserved top-level names have different purposes. [2]"]); setView("Canvas"); setInspector("Notes"); notice("Selection added to Canvas notes"); }}><Layers size={16}/>Send selection to Canvas</button>
                </article></div>
            </>}
            {view === "Canvas" && <div className="canvas-view">
                <div className="view-title"><span>{project} <span className="slash">/</span> Canvas</span><div><button onClick={() => { setNotes(items => [...items, ""]); setInspector("Notes"); }}><Plus size={14}/>Add note</button><button onClick={exportBrief}>Export</button></div></div>
                <div className="canvas-scroll"><div className="canvas-grid">
                    <div className="source-stack">{sources.map((item,i)=><div className="node source-node" key={item.title}><div className="node-head"><Globe size={17}/><strong>{item.title}</strong><span>[{i+1}]</span></div><h3>{item.subtitle}</h3><p>{i ? "The reference for reserved DNS names and their intended use." : "The administrative overview of reserved domains."}</p><button className="soft" onClick={()=>openSource(i)}>Open live tab <ArrowRight size={14}/></button></div>)}</div>
                    <div className="connection" aria-hidden="true"><span>sources</span><ArrowRight size={24}/></div>
                    <div className="node document-node"><div className="node-head"><FileText size={19}/><strong>Reserved domains comparison</strong></div><small>comparison.md · 2 linked sources</small><ul>{findings.map(([text,ids],i)=><li key={i}>{text} {citations(ids)}</li>)}</ul><button className="soft" onClick={()=>setInspector("Document")}>Inspect document <PanelRight size={14}/></button></div>
                    <div className="node terminal-node"><div className="node-head"><Terminal size={16}/><strong>Terminal</strong></div><pre><span>$</span> ls workspace{"\n"}comparison.md  source-notes.md{"\n\n"}<span>$</span> git status --short{"\n"}<b>?? comparison.md</b></pre><button className="text-button" onClick={()=>setView("Terminal")}>Open terminal view</button></div>
                    <div className="node note-node"><div className="node-head"><FileText size={16}/><strong>Working notes</strong></div>{notes.map((note,i)=><textarea aria-label={"Note "+(i+1)} key={i} value={note} placeholder="Add a thought…" onChange={e=>setNotes(items=>items.map((item,index)=>index===i?e.target.value:item))}/>)}<button className="text-button" onClick={()=>setNotes(items=>[...items,""])}>+ Add a note</button></div>
                </div></div><div className="canvas-hud"><span>Canvas</span><span>100%</span><button onClick={()=>notice("All source cards are in view")}>Fit to view</button></div>
            </div>}
            {view === "Space" && <div className="space-scroll"><div className="space">
                <div className="space-heading"><div><p className="eyebrow">Project space</p><h1>{project}</h1></div><button className="primary" onClick={()=>setView("Browser")}>Resume workspace <ArrowRight size={15}/></button></div>
                <div className="space-filters">{["Recent","Collections","Tasks","Downloads","Skills"].map(item=><button className={section===item?"active":""} key={item} onClick={()=>setSection(item)}>{item}</button>)}</div>
                {["Recent","Collections"].includes(section) && <><h2>Continue where you left off</h2><div className="resume-grid"><button onClick={()=>setView("Browser")}><Globe size={22}/><strong>Reserved domains</strong><span>IANA + RFC 2606</span><small>2 source tabs</small></button><button onClick={()=>setView("Canvas")}><Layers size={22}/><strong>Provider comparison brief</strong><span>Sources, findings, and notes</span><small>Canvas workspace</small></button></div>
                <div className="work-table"><header><span>Workspace</span><span>Contents</span><span>Last used</span></header>{[["Browser redesign","2 tabs, comparison.md","Today"],["Provider evaluation","3 sources, notes","Yesterday"],["Release notes","2 files","Nov 16"]].map(([a,b,c])=><button key={a} onClick={()=>{setProject(a);setView("Canvas");}}><span><Folder size={15}/>{a}</span><span>{b}</span><span>{c}</span></button>)}</div></>}
                {section==="Tasks" && <div className="task-list">{["Read IANA source","Compare RFC 2606","Save comparison.md"].map(t=><div key={t}><Check size={17}/>{t}<span>Completed</span></div>)}</div>}
                {section==="Downloads" && <div className="task-list"><button onClick={exportBrief}><FileText size={18}/>comparison.md <span>Export Markdown <ArrowUp size={14}/></span></button></div>}
                {section==="Skills" && <div className="task-list">{["Compare sources","Prepare a brief","Review changes"].map(skill=><button key={skill} onClick={()=>{setAgent(true);setDraft(skill+" for this workspace");notice("Skill prompt added to chat");}}><Command size={16}/>{skill}<ArrowRight size={15}/></button>)}</div>}
                <div className="space-foot"><Link size={16}/><span>Pages, conversations, and files stay connected to this space.</span></div>
            </div></div>}
            {view === "Files" && <div className="files-view"><div className="space-heading"><div><p className="eyebrow">Workspace files</p><h1>Files</h1></div><button onClick={exportBrief}>Export brief</button></div>{["comparison.md","source-notes.md"].map(file=><button className="file-row" key={file} onClick={()=>{setView("Canvas");setInspector(file==="comparison.md"?"Document":"Notes");}}><FileText size={20}/><span><strong>{file}</strong><small>{file==="comparison.md"?"Cited brief · 2 sources":"Working notes"}</small></span><ArrowRight size={16}/></button>)}</div>}
            {view==="Terminal" && <div className="terminal-view"><div className="view-title"><span>Terminal · {project}</span><span>Sample session</span></div><pre><span>workspace</span> ~{"\n"}$ ls{"\n"}comparison.md  source-notes.md{"\n\n"}$ cat comparison.md{"\n"}# Reserved domains comparison{"\n"}Sources: IANA [1], RFC 2606 [2]{"\n\n"}$ git status --short{"\n"}<b>?? comparison.md</b></pre><button className="soft" onClick={()=>setView("Canvas")}>View connected Canvas <ArrowRight size={15}/></button></div>}
            </main>
            {agent && <aside className="inspector"><div className="inspector-tabs">{(view==="Canvas"?["Document","Notes","Agent"]:["Chat","Activity"]).map(item=><button className={(view==="Canvas"?inspector===item:activity?item==="Activity":item==="Chat")?"selected":""} key={item} onClick={()=>view==="Canvas"?setInspector(item):setActivity(item==="Activity")}>{item==="Chat"||item==="Agent"?<MessageSquare size={16}/>:item==="Activity"?<Activity size={16}/>:<FileText size={16}/>} {item}</button>)}{iconButton("Close inspector",X,()=>setAgent(false))}</div>
                {view==="Canvas"&&inspector!=="Agent"?<div className="document-inspector"><FileText size={24}/><h2>{inspector==="Notes"?"Working notes":"comparison.md"}</h2><p>{inspector==="Notes"?"Edit notes directly on the Canvas.":"A saved brief with traceable sources."}</p><hr/><h3>Sources</h3>{sources.map((item,i)=><button className="source-link" key={item.title} onClick={()=>openSource(i)}><span className="citation">[{i+1}]</span><span>{item.title}<small>{new URL(item.url).hostname}</small></span><ArrowRight size={14}/></button>)}<button className="primary full" onClick={exportBrief}>Export Markdown</button><hr/><p className="muted">Select a numbered citation to return to its page.</p></div>:<><div className="conversation">
                    <div className="context-chips"><button onClick={()=>setSourceChips([0,1])}>Sources ({sourceChips.length}) <ChevronDown size={12}/></button><div>{sourceChips.map(i=><button key={i} onClick={()=>openSource(i)}><Globe size={13}/>{sources[i].title}<span role="button" aria-label={"Detach "+sources[i].title} onClick={e=>{e.stopPropagation();setSourceChips(items=>items.filter(item=>item!==i));}}><X size={11}/></span></button>)}</div></div>
                    {activity?<div className="activity-list"><h3>Completed activity</h3>{["Read 2 source pages","Created comparison.md","Saved brief on Canvas"].map(text=><div key={text}><Check size={15}/><span>{text}</span></div>)}<button className="soft" onClick={()=>setView("Canvas")}>Open result <ArrowRight size={14}/></button></div>:<>
                    {messages.map((message,i)=><div className={"message "+message.role} key={i}><div className="message-author">{message.role==="user"?<span className="avatar">U</span>:<span className="agent-avatar"><Layers size={13}/></span>}<strong>{message.role==="user"?"You":"KronOS Agent"}</strong><small>{i<2?"10:24 AM":"Just now"}</small></div><p>{message.text}</p></div>)}
                    {busy&&<p className="muted">Preparing preview reply…</p>}<button className="result-link" onClick={()=>setView("Canvas")}><FileText size={16}/><span><strong>comparison.md</strong><small>Saved to Canvas · 2 sources</small></span><ArrowRight size={15}/></button>
                    <details className="completed" open><summary><Check size={15}/>Completed (2)<ChevronDown size={13}/></summary><div><Check size={14}/>Read 2 pages</div><button onClick={()=>setView("Canvas")}><Check size={14}/>Created comparison.md <ArrowUp size={13}/></button></details></>}
                </div><form className="composer" onSubmit={send}><textarea aria-label="Message KronOS Agent" placeholder="Message KronOS Agent…" value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send(e);}}}/><div><button type="button" title="Attach sources" onClick={()=>{setSourceChips([0,1]);notice("Both workspace sources attached");}}><Link size={16}/></button><span className="model">KronOS Agent <ChevronDown size={11}/></span><span className="spacer"/><button className="send" aria-label="Send message" disabled={!draft.trim()||busy}><ArrowUp size={17}/></button></div></form></>}
                <div className="preview-label">Interactive concept · sample content</div>
            </aside>}
        </div>
        {toast&&<div className="toast" role="status"><Check size={15}/>{toast}</div>}
        {palette&&<div className="modal" onClick={()=>setPalette(false)}><div className="palette" role="dialog" aria-modal="true" aria-label="Command center" onClick={e=>e.stopPropagation()}><div><Search size={18}/><input autoFocus placeholder="Find a view, source, or file…" value={search} onChange={e=>setSearch(e.target.value)}/>{iconButton("Close commands",X,()=>setPalette(false))}</div>{["Browser","Canvas","Files","Terminal","Space","IANA source","RFC 2606 source","comparison.md"].filter(item=>item.toLowerCase().includes(search.toLowerCase())).map(item=><button key={item} onClick={()=>{if(item.includes("source"))openSource(item.startsWith("IANA")?0:1);else setView(item==="comparison.md"?"Canvas":item);setPalette(false);setSearch("");}}>{item}<ArrowRight size={14}/></button>)}</div></div>}
    </div>;
}
createRoot(document.getElementById("root")).render(<App/>);
