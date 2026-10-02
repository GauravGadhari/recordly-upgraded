import { ArrowsIn, ArrowsOut, SquaresFour } from "@phosphor-icons/react";
import { useEffect, useState, type ReactNode } from "react";
import { Rnd, type Position } from "react-rnd";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

type WorkspaceMode = "docked" | "freeform";

type WindowBounds = Position & { width: number; height: number };

type Props = {
	sidebar: ReactNode;
	preview: ReactNode;
	timeline: ReactNode;
};

const STORAGE_KEY = "recordly.editor.workspace.v1";

const DEFAULT_WINDOWS: Record<string, WindowBounds> = {
	effects: { x: 12, y: 12, width: 330, height: 560 },
	preview: { x: 356, y: 12, width: 780, height: 560 },
	timeline: { x: 12, y: 586, width: 1124, height: 300 },
};

function readWorkspace() {
	if (typeof window === "undefined")
		return { mode: "docked" as WorkspaceMode, windows: DEFAULT_WINDOWS };
	try {
		const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
		return {
			mode: saved.mode === "freeform" ? ("freeform" as const) : ("docked" as const),
			windows: { ...DEFAULT_WINDOWS, ...(saved.windows ?? {}) } as Record<
				string,
				WindowBounds
			>,
		};
	} catch {
		return { mode: "docked" as WorkspaceMode, windows: DEFAULT_WINDOWS };
	}
}

function ResizeHandle({ direction }: { direction: "horizontal" | "vertical" }) {
	return (
		<PanelResizeHandle
			className={
				direction === "horizontal"
					? "group relative flex w-3 items-center justify-center outline-none"
					: "group relative flex h-3 items-center justify-center outline-none"
			}
		>
			<span
				className={
					direction === "horizontal"
						? "h-12 w-px rounded-full bg-foreground/15 transition-colors group-hover:bg-[#2563EB] group-data-[resize-handle-active]:bg-[#2563EB]"
						: "h-px w-12 rounded-full bg-foreground/15 transition-colors group-hover:bg-[#2563EB] group-data-[resize-handle-active]:bg-[#2563EB]"
				}
			/>
		</PanelResizeHandle>
	);
}

function FloatingWindow({
	id,
	title,
	bounds,
	onChange,
	children,
}: {
	id: string;
	title: string;
	bounds: WindowBounds;
	onChange: (id: string, next: WindowBounds) => void;
	children: ReactNode;
}) {
	return (
		<Rnd
			bounds="parent"
			className="overflow-hidden rounded-xl border border-foreground/12 bg-editor-bg shadow-[0_18px_48px_rgba(0,0,0,0.28)]"
			position={{ x: bounds.x, y: bounds.y }}
			size={{ width: bounds.width, height: bounds.height }}
			minWidth={260}
			minHeight={180}
			dragHandleClassName="editor-workspace-window-handle"
			onDragStop={(_event, data) => onChange(id, { ...bounds, x: data.x, y: data.y })}
			onResizeStop={(_event, _direction, element, _delta, position) =>
				onChange(id, {
					x: position.x,
					y: position.y,
					width: element.offsetWidth,
					height: element.offsetHeight,
				})
			}
		>
			<div className="editor-workspace-window-handle flex h-8 cursor-move items-center justify-between border-b border-foreground/10 bg-editor-surface-alt px-3 select-none">
				<span className="text-[11px] font-semibold tracking-wide text-foreground/75">
					{title}
				</span>
				<ArrowsOut className="h-3.5 w-3.5 text-muted-foreground" />
			</div>
			<div className="flex h-[calc(100%-2rem)] min-h-0 flex-col overflow-hidden p-2">
				{children}
			</div>
		</Rnd>
	);
}

/** A persistent editing workspace with Premiere-style docks and movable panel mode. */
export function EditorWorkspace({ sidebar, preview, timeline }: Props) {
	const [workspace, setWorkspace] = useState(readWorkspace);

	useEffect(() => {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
	}, [workspace]);

	const updateWindow = (id: string, next: WindowBounds) => {
		setWorkspace((current) => ({
			...current,
			windows: { ...current.windows, [id]: next },
		}));
	};

	return (
		<div className="relative min-h-0 flex-1">
			<div className="absolute right-2 top-1 z-30 flex overflow-hidden rounded-md border border-foreground/10 bg-editor-surface-alt shadow-sm">
				<button
					type="button"
					onClick={() => setWorkspace((current) => ({ ...current, mode: "docked" }))}
					title="Docked workspace"
					aria-label="Docked workspace"
					className={`flex h-7 w-8 items-center justify-center transition-colors ${workspace.mode === "docked" ? "bg-[#2563EB] text-white" : "text-muted-foreground hover:bg-foreground/10 hover:text-foreground"}`}
				>
					<SquaresFour className="h-4 w-4" />
				</button>
				<button
					type="button"
					onClick={() => setWorkspace((current) => ({ ...current, mode: "freeform" }))}
					title="Freeform workspace — drag windows by their title bar"
					aria-label="Freeform workspace"
					className={`flex h-7 w-8 items-center justify-center transition-colors ${workspace.mode === "freeform" ? "bg-[#2563EB] text-white" : "text-muted-foreground hover:bg-foreground/10 hover:text-foreground"}`}
				>
					<ArrowsIn className="h-4 w-4" />
				</button>
			</div>

			{workspace.mode === "docked" ? (
				<PanelGroup
					direction="vertical"
					autoSaveId="recordly-editor-main-layout"
					className="h-full min-h-0"
				>
					<Panel defaultSize={72} minSize={35}>
						<PanelGroup
							direction="horizontal"
							autoSaveId="recordly-editor-top-layout"
							className="h-full min-h-0"
						>
							<Panel
								defaultSize={27}
								minSize={18}
								maxSize={48}
								className="min-h-0 overflow-hidden"
							>
								<div className="flex h-full min-h-0 flex-col overflow-hidden">
									{sidebar}
								</div>
							</Panel>
							<ResizeHandle direction="horizontal" />
							<Panel minSize={35} className="min-h-0 overflow-hidden">
								<div className="flex h-full min-h-0 flex-col overflow-hidden">
									{preview}
								</div>
							</Panel>
						</PanelGroup>
					</Panel>
					<ResizeHandle direction="vertical" />
					<Panel
						defaultSize={28}
						minSize={18}
						maxSize={60}
						className="min-h-0 overflow-hidden"
					>
						<div className="flex h-full min-h-0 flex-col overflow-hidden">
							{timeline}
						</div>
					</Panel>
				</PanelGroup>
			) : (
				<div className="relative h-full min-h-0 overflow-hidden rounded-xl border border-foreground/10 bg-editor-surface-alt/45">
					<FloatingWindow
						id="effects"
						title="Effects"
						bounds={workspace.windows.effects}
						onChange={updateWindow}
					>
						{sidebar}
					</FloatingWindow>
					<FloatingWindow
						id="preview"
						title="Preview"
						bounds={workspace.windows.preview}
						onChange={updateWindow}
					>
						{preview}
					</FloatingWindow>
					<FloatingWindow
						id="timeline"
						title="Timeline"
						bounds={workspace.windows.timeline}
						onChange={updateWindow}
					>
						{timeline}
					</FloatingWindow>
				</div>
			)}
		</div>
	);
}
