import { createUniver, LocaleType, mergeLocales } from "@univerjs/presets";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import coreZh from "@univerjs/preset-sheets-core/locales/zh-CN";
import { UniverSheetsFilterPreset } from "@univerjs/preset-sheets-filter";
import filterZh from "@univerjs/preset-sheets-filter/locales/zh-CN";
import { UniverSheetsSortPreset } from "@univerjs/preset-sheets-sort";
import sortZh from "@univerjs/preset-sheets-sort/locales/zh-CN";
import { UniverSheetsConditionalFormattingPreset } from "@univerjs/preset-sheets-conditional-formatting";
import cfZh from "@univerjs/preset-sheets-conditional-formatting/locales/zh-CN";
import { UniverSheetsDataValidationPreset } from "@univerjs/preset-sheets-data-validation";
import dvZh from "@univerjs/preset-sheets-data-validation/locales/zh-CN";
import "@univerjs/preset-sheets-core/lib/index.css";
import "@univerjs/preset-sheets-filter/lib/index.css";
import "@univerjs/preset-sheets-sort/lib/index.css";
import "@univerjs/preset-sheets-conditional-formatting/lib/index.css";
import "@univerjs/preset-sheets-data-validation/lib/index.css";
import FormulaWorker from "./formula.worker?worker";
import type { WorkbookSnapshot } from "./types";
import { explainMatches } from "./trace";
import { deserializeListOptions } from "@univerjs/sheets";
export class SpreadsheetAdapter {
  api: any;
  private univer: any;
  private worker: Worker;
  private subscription: any;
  private selectionSubscription: any;
  private onSelect?: (sheet: string, range: string, value: string) => void;
  constructor(
    container: HTMLElement,
    snapshot: WorkbookSnapshot,
    onChange: () => void,
    onSelect?: (sheet: string, range: string, value: string) => void,
  ) {
    this.onSelect = onSelect;
    this.worker = new FormulaWorker();
    const { univer, univerAPI } = createUniver({
      locale: LocaleType.ZH_CN,
      locales: {
        [LocaleType.ZH_CN]: mergeLocales(coreZh, filterZh, sortZh, cfZh, dvZh),
      },
      presets: [
        UniverSheetsCorePreset({
          container,
          workerURL: this.worker,
          header: false,
          toolbar: true,
          formulaBar: true,
        }),
        UniverSheetsFilterPreset(),
        UniverSheetsSortPreset(),
        UniverSheetsConditionalFormattingPreset(),
        UniverSheetsDataValidationPreset(),
      ],
    });
    this.univer = univer;
    this.api = univerAPI;
    this.api.createWorkbook(JSON.parse(JSON.stringify(snapshot)));
    this.subscription = this.api.addEvent(
      this.api.Event.CommandExecuted,
      (e: any) => {
        if (
          e.id?.includes("mutation") &&
          !e.id.includes("formula-calculation") &&
          !e.id.includes("set-formula") &&
          !e.id.includes("selection")
        ) {
          onChange();
          this.refreshSelection();
        }
      },
    );
    this.selectionSubscription = this.api.addEvent(
      this.api.Event.SelectionChanged,
      () => this.refreshSelection(),
    );
  }
  refreshSelection() {
    const s = this.api.getActiveWorkbook()?.getActiveSheet();
    const r = s?.getActiveRange();
    if (r)
      this.onSelect?.(
        s.getSheetId(),
        r.getA1Notation(),
        r.getFormula() || String(r.getValue() ?? ""),
      );
  }
  async fillDown(sheet: string, range: string) {
    const s = this.api.getActiveWorkbook().getSheetBySheetId(sheet);
    const r = s.getRange(range);
    const bounds = r.getRange();
    if (bounds.endRow <= bounds.startRow)
      throw Error("先选中至少两行，例如 D2:D4。首行需要已有公式。");
    const first = s.getRange(
      bounds.startRow,
      bounds.startColumn,
      1,
      bounds.endColumn - bounds.startColumn + 1,
    );
    await first.autoFill(r, "COPY");
  }
  async wait() {
    await this.api.getFormula().onCalculationResultApplied(12000);
  }
  snapshot(): WorkbookSnapshot {
    const workbook = this.api.getActiveWorkbook();
    const snapshot = structuredClone(workbook.save());
    // Fill uses shared-formula IDs. Resolve them through the engine before
    // cloning, so independent workbooks never lose their relative offsets.
    for (const [id, sheet] of Object.entries(snapshot.sheets) as [
      string,
      any,
    ][]) {
      const facade = workbook.getSheetBySheetId(id);
      for (const [r, row] of Object.entries(sheet.cellData) as [string, any][])
        for (const [c, cell] of Object.entries(row) as [string, any][])
          if (cell.si || cell.f) {
            const formula = facade
              .getRange(Number(r), Number(c), 1, 1)
              .getFormula();
            if (formula) cell.f = formula;
            delete cell.si;
          }
    }
    return snapshot;
  }
  focus(sheet: string, range: string) {
    const s = this.api.getActiveWorkbook().getSheetBySheetId(sheet);
    this.api.getActiveWorkbook().setActiveSheet(s);
    s.getRange(range).activate();
    this.onSelect?.(
      sheet,
      range,
      s.getRange(range).getFormula() ||
        String(s.getRange(range).getValue() ?? ""),
    );
  }
  write(sheet: string, range: string, value: string) {
    const target = this.api
      .getActiveWorkbook()
      .getSheetBySheetId(sheet)
      .getRange(range);
    const rule = target.getDataValidation();
    if (
      rule?.getCriteriaType() === "list" &&
      !rule.getAllowInvalid() &&
      !deserializeListOptions(rule.getCriteriaValues()[1] ?? "").includes(value)
    )
      throw Error("这个单元格只允许列表中的值。请从下拉选项中选择。");
    const parsed = value.startsWith("'")
      ? value.slice(1)
      : /^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(value)
        ? Number(value)
        : value;
    target.setValue(parsed);
  }
  trace(sheet: string, range: string) {
    const s = this.api.getActiveWorkbook().getSheetBySheetId(sheet);
    const formula = s.getRange(range).getFormula();
    const nodes = formula
      ? this.api.getFormula().sequenceNodesBuilder(formula)
      : [];
    const read = (ref: string) => {
      const p = ref.split("!");
      return p.length === 2
        ? this.api
            .getActiveWorkbook()
            .getSheetByName(p[0].replace(/^'|'$/g, ""))
            .getRange(p[1])
            .getValues()
        : s.getRange(ref).getValues();
    };
    const references = nodes
      .filter((n: any) => typeof n !== "string" && n.nodeType === 4)
      .map((n: any) => {
        try {
          return { token: n.token, values: read(n.token) };
        } catch {
          return { token: n.token, values: [] };
        }
      });
    return { formula, nodes, references, rows: explainMatches(formula, read) };
  }
  async operate(kind: string, options: any) {
    const s = this.api.getActiveWorkbook().getSheetBySheetId("main");
    if (kind === "sort-filter") {
      s.getRange("A2:D6").sort({ column: 2, ascending: options.ascending });
      let filter = s.getFilter();
      if (filter) filter.remove();
      filter = s.getRange("A1:D6").createFilter();
      filter.setColumnFilterCriteria(1, {
        colId: 1,
        filters: { filters: [options.category] },
      });
    }
    if (kind === "format") {
      s.clearConditionalFormatRules();
      const range = s.getRange(options.range);
      const rule = s
        .newConditionalFormattingRule()
        .whenNumberLessThan(Number(options.threshold))
        .setBackground("#fce0da")
        .setRanges([range.getRange()])
        .build();
      s.addConditionalFormattingRule(rule);
    }
    if (kind === "validation") {
      const rule = this.api
        .newDataValidation()
        .requireValueInList(
          options.values.split(/[,，]/).map((x: string) => x.trim()),
          false,
          true,
        )
        .setAllowInvalid(!options.reject)
        .setOptions({ showErrorMessage: true, error: "请从允许的状态中选择。" })
        .build();
      s.getRange(options.range).setDataValidation(rule);
    }
  }
  operationState(kind: string) {
    const s = this.api.getActiveWorkbook().getSheetBySheetId("main");
    if (kind === "sort-filter") {
      const f = s.getFilter();
      return {
        criteria: f?.getColumnFilterCriteria(1),
        range: f?.getRange().getRange(),
        hidden: f?.getFilteredOutRows(),
        rows: s.getRange("A2:D6").getValues(),
      };
    }
    if (kind === "format") return s.getConditionalFormattingRules();
    return ["D2", "D3", "D4", "D5", "D6"].map((a) => {
      const v = s.getRange(a).getDataValidation();
      return v
        ? {
            type: v.getCriteriaType(),
            options: deserializeListOptions(v.getCriteriaValues()[1] ?? ""),
            allowInvalid: v.getAllowInvalid(),
          }
        : null;
    });
  }
  dispose() {
    this.subscription?.dispose();
    this.selectionSubscription?.dispose();
    this.univer.dispose();
    this.worker.terminate();
  }
}
