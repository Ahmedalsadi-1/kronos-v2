import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { setPageMeta } from "./lib/meta";
import { ProductCaptures } from "./os-captures";
import { OsClipPlayer } from "./os-clip-player";
import "./os-landing.css";

const ScreenshotFiles = import.meta.glob("/public/assets/kronos/*.webp");

export function hasProductCapture(name: string) {
    return ProductCaptures[name] != null || `/public/assets/kronos/${name}.webp` in ScreenshotFiles;
}

const Layouts = [
    {
        id: "os",
        name: "OS",
        title: "A desktop built around your work.",
        text: "Arrange live windows, move between tasks in Overview, and keep your tools within reach in the dock.",
        shot: "os-desktop",
        label: "KronOS desktop",
    },
    {
        id: "canvas",
        name: "Canvas",
        title: "Give your ideas room to grow.",
        text: "Spread out browsers, terminals, files, and notes on a spatial canvas. Keep the whole project in view.",
        shot: "canvas",
        label: "Spatial canvas",
    },
    {
        id: "tabs",
        name: "Tabs",
        title: "A little more focus. A lot less clutter.",
        text: "Move between focused tabs and split panes when you need two tools side by side.",
        shot: "tabs",
        label: "Tabbed workspace",
    },
    {
        id: "design",
        name: "Design",
        title: "Give the next idea a place to take shape.",
        text: "Arrange your artboards, see the whole design, and work with KronOS Agent on the same canvas.",
        shot: "design",
        label: "Design on Canvas",
    },
];

const Questions = [
    [
        "What is KronOS?",
        "KronOS is a desktop workspace that brings terminals, browsers, files, previews, remote sessions, and KronOS Agent together. Arrange the same tools in OS, Canvas, Tabs, or Widgets mode.",
    ],
    [
        "Is this the same project as KronTerm?",
        "Yes. KronOS is the current product name. The product has grown from a terminal workspace into a shared desktop for you, your tools, and your agent.",
    ],
    [
        "How does KronOS Agent fit into the workspace?",
        "KronOS Agent is the built-in chat and agent surface, backed by the managed Hermes runtime. Work in full chat or alongside your canvas, and use /files, /terminal, and /preview to bring workspace context into the conversation.",
    ],
    [
        "Can I keep using my terminal and remote sessions?",
        "Yes. Terminals and SSH connections are part of the workspace alongside browsers and files. You can choose a focused tab, a tiled split, or a spatial arrangement for the task.",
    ],
    [
        "What is available to download?",
        "The linked release is the KronOS 0.14.3 public preview for Apple silicon Macs. Check the download page for requirements and release notes. The iPhone client and phone-control bridge are Labs work.",
    ],
];

export function ScreenshotSlot({ name, label, hero = false }: { name: string; label: string; hero?: boolean }) {
    const [failed, setFailed] = useState(false);
    const capture = ProductCaptures[name];
    const filename = capture?.file ?? `${name}.webp`;
    const caption = capture?.label ?? label;
    const src = `${import.meta.env.BASE_URL}assets/kronos/${filename}`;
    const available = hasProductCapture(name);
    const isVideo = capture?.kind === "video";
    if (!available || failed) return null;
    return (
        <figure className={`os-shot ${hero ? "os-shot-hero" : ""}`} data-capture={name}>
            <figcaption>
                <span>{caption}</span>
                {capture?.status && <span className="os-shot-status">{capture.status}</span>}
            </figcaption>
            <div
                className={`os-shot-content ${available && !failed ? (isVideo ? "os-shot-content-video" : "os-shot-content-image") : ""}`}
            >
                {available && !failed && isVideo && (
                    <OsClipPlayer
                        key={src}
                        src={src}
                        poster={`${import.meta.env.BASE_URL}assets/kronos/${capture.poster}`}
                        label={caption}
                        onError={() => setFailed(true)}
                    />
                )}
                {available && !failed && !isVideo && (
                    <img
                        src={src}
                        alt={caption}
                        width={capture?.width}
                        height={capture?.height}
                        loading={hero ? "eager" : "lazy"}
                        fetchPriority={hero ? "high" : "auto"}
                        onError={() => setFailed(true)}
                    />
                )}
            </div>
        </figure>
    );
}

export function OsLanding() {
    const [layout, setLayout] = useState(1);
    const activeLayout = Layouts[layout];

    useEffect(() => {
        setPageMeta(
            "KronOS | A workspace for you and your agents",
            "Your terminal, browser, files, and AI agent. One persistent desktop. Meet KronOS, the workspace for human and agent work."
        );
    }, []);

    function selectLayout(index: number, focus = false) {
        setLayout(index);
        if (focus) document.getElementById(`layout-tab-${index}`)?.focus();
    }

    return (
        <>
            <section className="os-hero os-grid-paper">
                <div className="os-container">
                    <div className="os-hero-top">
                        <span>Your tools. Your agents. Your space.</span>
                        <span>KronOS / Desktop workspace</span>
                    </div>
                    <h1>
                        A workspace for
                        <br />
                        you and your <span>agents.</span>
                    </h1>
                    <p className="os-hero-copy">
                        Your terminal, browser, files, and AI agent.
                        <br className="os-desktop-break" /> Together in one persistent desktop. Built around the way you
                        work.
                    </p>
                    <div className="os-actions">
                        <Link to="/download" className="os-button os-button-dark">
                            Download KronOS
                        </Link>
                        <a href="#workspace" className="os-button os-button-outline">
                            Meet your workspace
                        </a>
                    </div>
                    <p className="os-release-note">
                        macOS preview <span aria-hidden="true">·</span> Apple silicon
                    </p>
                    <ScreenshotSlot name="workspace-hero" label="Your whole workspace. One place." hero />
                </div>
            </section>

            <div className="os-surface-strip">
                <div className="os-container">
                    <p>
                        Less switching.
                        <br />
                        <strong>More doing.</strong>
                    </p>
                    <ul>
                        <li>Terminal</li>
                        <li>Browser</li>
                        <li>Files</li>
                        <li>Agents</li>
                        <li>Remote</li>
                        <li>Preview</li>
                    </ul>
                </div>
            </div>

            <section className="os-workspace os-section os-grid-paper" id="workspace">
                <div className="os-container">
                    <div className="os-section-heading">
                        <p className="os-eyebrow">One workspace. Your arrangement.</p>
                        <h2>
                            Make room for
                            <br />
                            your kind of work.
                        </h2>
                        <p>
                            Some tasks need focus. Others need the whole picture.
                            <br className="os-desktop-break" /> Change the layout. Keep the tools and context.
                        </p>
                    </div>
                    <div className="os-layout-tabs" role="tablist" aria-label="Workspace layouts">
                        {Layouts.map((item, index) => (
                            <button
                                key={item.id}
                                id={`layout-tab-${index}`}
                                role="tab"
                                aria-selected={layout === index}
                                aria-controls="layout-panel"
                                tabIndex={layout === index ? 0 : -1}
                                onClick={() => selectLayout(index)}
                                onKeyDown={(event) => {
                                    let next = index;
                                    if (event.key === "ArrowRight") next = (index + 1) % Layouts.length;
                                    else if (event.key === "ArrowLeft")
                                        next = (index + Layouts.length - 1) % Layouts.length;
                                    else if (event.key === "Home") next = 0;
                                    else if (event.key === "End") next = Layouts.length - 1;
                                    else return;
                                    event.preventDefault();
                                    selectLayout(next, true);
                                }}
                            >
                                <span className={`os-layout-icon os-layout-icon-${item.id}`} aria-hidden="true">
                                    <i />
                                    <i />
                                    <i />
                                </span>
                                {item.name}
                            </button>
                        ))}
                    </div>
                    <div id="layout-panel" role="tabpanel" aria-labelledby={`layout-tab-${layout}`} tabIndex={0}>
                        <ScreenshotSlot key={activeLayout.shot} name={activeLayout.shot} label={activeLayout.label} />
                        <div className="os-layout-caption">
                            <h3>{activeLayout.title}</h3>
                            <p>{activeLayout.text}</p>
                        </div>
                    </div>
                </div>
            </section>

            <section className="os-agent" id="agent">
                <div className="os-container">
                    <div className="os-agent-heading">
                        <div>
                            <p className="os-eyebrow">Meet KronOS Agent</p>
                            <h2>
                                In the conversation.
                                <br />
                                In the workspace.
                            </h2>
                        </div>
                        <div>
                            <p>
                                Bring your agent closer to the work. Chat, open files, use the terminal, and follow
                                along with the tools already on your desktop.
                            </p>
                            <Link to="/docs" className="os-text-link">
                                Read the agent guide
                            </Link>
                        </div>
                    </div>
                    <ScreenshotSlot name="agent-workspace" label="KronOS Agent alongside your work" />
                    <div className="os-agent-features">
                        <div>
                            <h3>Full chat or Canvas</h3>
                            <p>
                                Code in a focused conversation or work beside your canvas. Keep the conversation as you
                                switch.
                            </p>
                        </div>
                        <div>
                            <h3>Context within reach</h3>
                            <p>
                                Bring files, terminal output, and previews into the conversation with{" "}
                                <code>/files</code>, <code>/terminal</code>, and <code>/preview</code>.
                            </p>
                        </div>
                        <div>
                            <h3>Follow the work</h3>
                            <p>Keep the agent, the tools it uses, and the result in the same operating picture.</p>
                        </div>
                    </div>
                </div>
            </section>

            <section className="os-tools os-section" id="tools">
                <div className="os-container">
                    <div className="os-section-heading">
                        <p className="os-eyebrow">A connected desktop</p>
                        <h2>
                            All the pieces.
                            <br />
                            Finally, in one place.
                        </h2>
                        <p>Keep the tools you reach for every day close to the task.</p>
                    </div>
                    <div className="os-tool-list">
                        <div>
                            <span className="os-tool-symbol" aria-hidden="true">
                                &gt;_
                            </span>
                            <h3>A real terminal</h3>
                            <p>Run commands, watch logs, and keep sessions beside the work they support.</p>
                        </div>
                        <div>
                            <span className="os-tool-symbol" aria-hidden="true">
                                www
                            </span>
                            <h3>A browser at hand</h3>
                            <p>Research, inspect, and preview without losing your place in the workspace.</p>
                        </div>
                        <div>
                            <span className="os-tool-symbol" aria-hidden="true">
                                /
                            </span>
                            <h3>Files in context</h3>
                            <p>Browse the project, open a file, and keep what you need next to your tools.</p>
                        </div>
                        <div>
                            <span className="os-tool-symbol" aria-hidden="true">
                                ssh
                            </span>
                            <h3>Room for remote work</h3>
                            <p>Bring remote connections into the same workspace as your local sessions.</p>
                        </div>
                    </div>
                </div>
            </section>

            <section className="os-context os-grid-paper">
                <div className="os-container">
                    <div className="os-context-copy">
                        <p className="os-eyebrow">From command to result</p>
                        <h2>
                            Keep the thread
                            <br />
                            of your work.
                        </h2>
                        <p>
                            The command you ran. The file you changed. The page you’re testing. Give each part of a task
                            a place in the same workspace.
                        </p>
                        <a className="os-text-link" href="#workspace">
                            Find your layout
                        </a>
                    </div>
                    <ScreenshotSlot name="connected-workflow" label="Terminal, files, and browser together" />
                </div>
            </section>

            <section className="os-context os-labs os-grid-paper" id="labs">
                <div className="os-container">
                    <div className="os-context-copy">
                        <p className="os-eyebrow">KronOS Labs</p>
                        <h2>
                            A little
                            <br />
                            further out.
                        </h2>
                        <p>
                            The iPhone client and phone-control bridge are Labs work. Here’s a simulator beside the
                            browser, inside the workspace. Availability depends on your build.
                        </p>
                        <Link className="os-text-link" to="/docs">
                            Read the workspace guide
                        </Link>
                    </div>
                    <ScreenshotSlot name="labs-iphone" label="iPhone simulator and browser: Labs preview" />
                </div>
            </section>

            <section className="os-faq os-section" id="questions">
                <div className="os-container">
                    <p className="os-eyebrow">A few things to know</p>
                    <h2>Good questions.</h2>
                    <div className="os-faq-list">
                        {Questions.map(([question, answer]) => (
                            <details key={question}>
                                <summary>
                                    {question}
                                    <span className="os-faq-plus" aria-hidden="true" />
                                </summary>
                                <p>{answer}</p>
                            </details>
                        ))}
                    </div>
                </div>
            </section>

            <section className="os-final">
                <div className="os-container">
                    <p className="os-eyebrow">Your next workspace</p>
                    <h2>
                        Open a little
                        <br />
                        more possibility.
                    </h2>
                    <div>
                        <Link className="os-button os-button-dark" to="/download">
                            Download KronOS
                        </Link>
                        <p>
                            Start with the macOS preview.
                            <br />
                            Make the workspace yours.
                        </p>
                    </div>
                </div>
            </section>
        </>
    );
}
