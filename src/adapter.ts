import { measured, performanceEnabled } from "./performance";
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
import type { OperationGoal, WorkbookSnapshot } from "./types";
import {
  bounds,
  rangeCells,
  type Bounds,
  type FormatRule,
  type OperationState,
  type OperationInput,
} from "./operations";
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
  undo() {
    this.api.undo();
  }
  redo() {
    this.api.redo();
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
    const started = performance.now();
    target.setValue(parsed);
    if (performanceEnabled)
      void this.wait()
        .then(() => measured("recalculate", started))
        .catch(() => {});
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
  async operate(goal: OperationGoal, options: OperationInput) {
    const s = this.api.getActiveWorkbook().getSheetBySheetId(goal.sheet);
    if (goal.kind === "sort-filter") {
      const area = bounds(goal.range);
      s.getFilter()?.remove();
      s.getRange(
        area.startRow + 1,
        area.startColumn,
        area.endRow - area.startRow,
        area.endColumn - area.startColumn + 1,
      ).sort({
        column: goal.sort.column - area.startColumn,
        ascending: options.ascending,
      });
      const filter = s.getRange(goal.range).createFilter();
      filter.setColumnFilterCriteria(goal.filter.column, {
        colId: goal.filter.column,
        filters: { filters: [options.category] },
      });
    } else if (goal.kind === "format") {
      // The teaching tool replaces rules only in the chosen range, not on other sheets/ranges.
      const range = s.getRange(options.range);
      range.clearConditionalFormatRules();
      const rule = s
        .newConditionalFormattingRule()
        .whenNumberLessThan(Number(options.threshold))
        .setBackground(goal.background)
        .setRanges([range.getRange()])
        .build();
      s.addConditionalFormattingRule(rule);
    } else {
      const rule = this.api
        .newDataValidation()
        .requireValueInList(
          options.values.split(/[,，]/).map((x) => x.trim()),
          false,
          true,
        )
        .setAllowInvalid(!options.reject)
        .setOptions({ showErrorMessage: true, error: "请从允许的状态中选择。" })
        .build();
      s.getRange(options.range).setDataValidation(rule);
    }
  }
  operationState(goal: OperationGoal): OperationState {
    const s = this.api.getActiveWorkbook().getSheetBySheetId(goal.sheet);
    const area = bounds(goal.range);
    if (goal.kind === "sort-filter") {
      const f = s.getFilter();
      const actualRange: Bounds | null = f?.getRange().getRange() ?? null;
      const filteredRows: number[] = f?.getFilteredOutRows() ?? [];
      const hiddenRows: number[] = [];
      for (let r = area.startRow + 1; r <= area.endRow; r++)
        if (filteredRows.includes(r) || !s.getSheet().getRowVisible(r))
          hiddenRows.push(r);
      const criteria: Extract<
        OperationState,
        { kind: "sort-filter" }
      >["criteria"] = [];
      if (actualRange)
        for (let c = actualRange.startColumn; c <= actualRange.endColumn; c++) {
          const rule = f.getColumnFilterCriteria(c);
          if (rule)
            criteria.push({
              column: c,
              values: rule.filters?.filters ?? [],
              unsupported: !!(
                rule.customFilters ||
                rule.dynamicFilter ||
                rule.colorFilter ||
                rule.top10 ||
                rule.filters?.blank
              ),
            });
        }
      const values = s.getRange(goal.range).getValues();
      return {
        kind: goal.kind,
        sheet: goal.sheet,
        range: actualRange,
        criteria,
        hiddenRows,
        filteredRows,
        headers: values[0],
        rows: values.slice(1),
      };
    }
    if (goal.kind === "format") {
      const raw: {
        ranges: Bounds[];
        rule: {
          type: string;
          subType?: string;
          operator?: string;
          value?: unknown;
          style?: { bg?: { rgb?: string } };
        };
      }[] = s.getConditionalFormattingRules();
      const rules: FormatRule[] = raw.map((r) => ({
        ranges: r.ranges,
        type: r.rule.type,
        subType: r.rule.subType,
        operator: r.rule.operator,
        value: r.rule.value,
        background: r.rule.style?.bg?.rgb,
      }));
      return { kind: goal.kind, sheet: goal.sheet, rules };
    }
    return {
      kind: goal.kind,
      sheet: goal.sheet,
      cells: rangeCells(area).map((address) => {
        const v = s.getRange(address).getDataValidation();
        return {
          address,
          type: v?.getCriteriaType() ?? null,
          values: v
            ? deserializeListOptions(v.getCriteriaValues()[1] ?? "")
            : [],
          allowInvalid: v?.getAllowInvalid() ?? true,
          showError: v?.rule.showErrorMessage === true,
        };
      }),
    };
  }
  dispose() {
    this.subscription?.dispose();
    this.selectionSubscription?.dispose();
    this.univer.dispose();
    this.worker.terminate();
  }
}
