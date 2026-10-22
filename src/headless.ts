import {
  Univer,
  UniverInstanceType,
  LocaleType,
  LifecycleService,
  LifecycleStages,
} from "@univerjs/core";
import { FUniver } from "@univerjs/core/facade";
import { UniverSheetsPlugin } from "@univerjs/sheets";
import { UniverFormulaEnginePlugin } from "@univerjs/engine-formula";
import {
  UniverSheetsFormulaPlugin,
  TriggerCalculationController,
} from "@univerjs/sheets-formula";
import "@univerjs/sheets/facade";
import "@univerjs/engine-formula/facade";
import type { WorkbookSnapshot } from "./types";
export async function calculate(snapshot: WorkbookSnapshot) {
  const univer = new Univer({
    locale: LocaleType.ZH_CN,
    locales: { [LocaleType.ZH_CN]: {} },
  });
  univer.registerPlugin(UniverSheetsPlugin);
  univer.registerPlugin(UniverFormulaEnginePlugin);
  univer.registerPlugin(UniverSheetsFormulaPlugin);
  const api = FUniver.newAPI(univer);
  try {
    const fresh = structuredClone(snapshot);
    // Cached values belong to the learner's previous data. Never let the
    // engine's WHEN_EMPTY initialization reuse them in a changed-data test.
    for (const sheet of Object.values(fresh.sheets))
      for (const row of Object.values(sheet.cellData))
        for (const cell of Object.values(row))
          if (cell.f) {
            delete cell.v;
            delete cell.t;
          }
    univer.createUnit(UniverInstanceType.UNIVER_SHEET, fresh as any);
    univer.__getInjector().get(LifecycleService).stage =
      LifecycleStages.Rendered;
    univer.__getInjector().get(TriggerCalculationController);
    const formula = api.getFormula();
    formula.executeCalculation();
    await formula.onCalculationResultApplied(12000);
    const book = api.getActiveWorkbook()!.save() as unknown as WorkbookSnapshot;
    const functions: Record<string, string[]> = {};
    for (const [sid, s] of Object.entries(book.sheets))
      for (const [r, row] of Object.entries(s.cellData))
        for (const [c, cell] of Object.entries(row))
          if (cell.f)
            functions[`${sid}:${r}:${c}`] = formula
              .sequenceNodesBuilder(cell.f)
              .filter((n) => typeof n !== "string" && n.nodeType === 3)
              .map((n) => (n as { token: string }).token.toUpperCase());
    return { book, functions };
  } finally {
    univer.dispose();
  }
}
