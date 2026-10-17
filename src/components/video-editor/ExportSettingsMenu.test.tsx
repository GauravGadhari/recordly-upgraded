import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ExportSettingsMenu } from "./ExportSettingsMenu";
import { I18nProvider } from "@/contexts/I18nContext";

describe("ExportSettingsMenu", () => {
	it("renders without crashing", () => {
		const html = renderToStaticMarkup(
			<I18nProvider>
				<ExportSettingsMenu
					exportFormat="mp4"
					exportQuality="good"
					exportEncodingMode="balanced"
					mp4FrameRate={60}
					gifFrameRate={30}
					gifLoop={true}
					gifSizePreset="medium"
					gifOutputDimensions={{ width: 1280, height: 720 }}
				/>
			</I18nProvider>,
		);
		expect(html).toContain("Export");
	});
});
