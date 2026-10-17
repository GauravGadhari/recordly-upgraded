import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EditorExportMenu } from "./layout/EditorExportMenu";
import { I18nProvider } from "@/contexts/I18nContext";

describe("EditorExportMenu", () => {
	it("renders when export dropdown is open without throwing React Aria collection error", () => {
		const dummyProps: any = {
			t: (key: string, fallback?: string) => fallback ?? key,
			exportSettings: {
				exportQuality: "good",
				setExportQuality: vi.fn(),
				exportEncodingMode: "balanced",
				setExportEncodingMode: vi.fn(),
				exportPipelineModel: "standard",
				mp4FrameRate: 60,
				setMp4FrameRate: vi.fn(),
				exportFormat: "mp4",
				setExportFormat: vi.fn(),
				gifFrameRate: 30,
				setGifFrameRate: vi.fn(),
				gifLoop: true,
				setGifLoop: vi.fn(),
				gifSizePreset: "medium",
				setGifSizePreset: vi.fn(),
				includeCaptionSidecar: false,
				setIncludeCaptionSidecar: vi.fn(),
			},
			exportSession: {
				isExporting: false,
				exportProgress: null,
				exportError: null,
				showExportDropdown: true,
				setShowExportDropdown: vi.fn(),
				exportedFilePath: null,
				hasPendingExportSave: false,
			},
			exportDimensions: {
				gifOutputDimensions: { width: 1280, height: 720 },
				mp4OutputDimensions: { good: { width: 1920, height: 1080 } },
			},
			exportStatus: {
				isExportPreparing: false,
				isExportSaving: false,
				isRenderingAudio: false,
				isExportFinalSaveIndeterminate: false,
				isLightningExportInProgress: false,
				isLegacyExportInProgress: false,
				exportFinalizingProgress: null,
				exportRenderSpeedLabel: null,
				exportPercentLabel: "0%",
				runtimeLabel: null,
				nativeSkipLabel: null,
			},
			hasCaptionsForSidecar: false,
			nvidiaCudaExportAvailable: false,
			experimentalNvidiaCudaExport: false,
			setExperimentalNvidiaCudaExport: vi.fn(),
			handleOpenExportDropdown: vi.fn(),
			handleExportDropdownClose: vi.fn(),
			handleCancelExport: vi.fn(),
			handleRetrySaveExport: vi.fn(),
			handleStartExportFromDropdown: vi.fn(),
			revealExportedFile: vi.fn(),
			exportMessage: null,
		};

		expect(() => {
			renderToStaticMarkup(
				<I18nProvider>
					<EditorExportMenu {...dummyProps} />
				</I18nProvider>,
			);
		}).not.toThrow();
	});
});
