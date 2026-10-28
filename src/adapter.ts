import { measured, performanceEnabled } from "./performance";
import { createUniver, LocaleType, mergeLocales } from "@univerjs/presets";
import {
  inputIssue,
  calculationAdvice,
  type EditorState,
} from "./input-diagnostics";
import {
  IEditorService,
  ILayoutService,
  InsertTextCommand,
  IEditorBridgeService,
} from "@univerjs/preset-sheets-core";
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
  private subscriptions: { dispose(): void }[] = [];
  private rendered: Promise<void>;
  private editor: EditorState = {
    active: false,
    sheet: "",
    cell: "",
    text: "",
    revision: 0,
  };
  private allowText?: string;
  private composing = false;
  private committing?: Promise<boolean>;
  private editingChanged?: (editor: EditorState) => void;
  private onSelect?: (
    sheet: string,
    range: string,
    value: string,
    error?: string,
  ) => void;
  constructor(
    private readonly container: HTMLElement,
    snapshot: WorkbookSnapshot,
    onChange: () => void,
    onSelect?: (
      sheet: string,
      range: string,
      value: string,
      error?: string,
    ) => void,
    editingChanged?: (editor: EditorState) => void,
  ) {
    const compositionStart = () => {
      this.composing = true;
    };
    const compositionEnd = () => {
      this.composing = false;
    };
    container.addEventListener("compositionstart", compositionStart, true);
    container.addEventListener("compositionend", compositionEnd, true);
    this.subscriptions.push({
      dispose: () => {
        container.removeEventListener(
          "compositionstart",
          compositionStart,
          true,
        );
        container.removeEventListener("compositionend", compositionEnd, true);
      },
    });
    this.onSelect = onSelect;
    this.editingChanged = editingChanged;
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
          header: true,
          toolbar: false,
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
    this.rendered = new Promise<void>((resolve) => {
      this.subscriptions.push(
        this.api.addEvent(this.api.Event.LifeCycleChanged, ({ stage }: any) => {
          if (stage >= this.api.Enum.LifecycleStages.Rendered) resolve();
        }),
      );
    });
    const publishEditor = (e: any, active: boolean, text?: string) => {
      const location = this.univer
        .__getInjector()
        .get(IEditorBridgeService)
        .getEditLocation();
      this.editor = {
        active,
        sheet: location?.sheetId ?? e.worksheet.getSheetId(),
        cell: e.worksheet.getRange(e.row, e.column, 1, 1).getA1Notation(),
        text: text ?? this.editor.text,
        revision: this.editor.revision + 1,
        issue: active ? inputIssue(text ?? this.editor.text) : undefined,
      };
      this.editingChanged?.({ ...this.editor });
    };
    this.subscriptions.push(
      this.api.addEvent(this.api.Event.SheetEditStarted, (e: any) =>
        publishEditor(
          e,
          true,
          e.worksheet.getRange(e.row, e.column, 1, 1).getFormula() ||
            String(
              e.worksheet.getRange(e.row, e.column, 1, 1).getValue() ?? "",
            ),
        ),
      ),
      this.api.addEvent(this.api.Event.SheetEditChanging, (e: any) =>
        publishEditor(e, true, e.value.toPlainText()),
      ),
      this.api.addEvent(this.api.Event.BeforeSheetEditEnd, (e: any) => {
        const text = e.value.toPlainText();
        if (
          e.isConfirm &&
          inputIssue(text)?.code === "missing-equals" &&
          this.allowText !== text
        ) {
          e.cancel = true;
          publishEditor(e, true, text);
        }
      }),
      this.api.addEvent(this.api.Event.SheetEditEnded, (e: any) => {
        this.allowText = undefined;
        publishEditor(e, false);
        this.refreshSelection();
      }),
    );
    this.api.createWorkbook(JSON.parse(JSON.stringify(snapshot)));
    this.subscription = this.api.addEvent(
      this.api.Event.CommandExecuted,
      (e: any) => {
        // Keyboard moves may mutate the selection object in place in Univer 1.2.
        if (
          e.id?.startsWith("sheet.command.move-selection") ||
          e.options?.applyFormulaCalculationResult ||
          e.id === "sheet.operation.set-selections"
        )
          this.refreshSelection();
        if (
          e.id?.startsWith("sheet.mutation.") &&
          !e.options?.fromFormula &&
          !e.id.includes("formula-calculation") &&
          !e.id.includes("set-formula") &&
          !e.id.includes("selection")
        ) {
          onChange();
          this.refreshSelection();
          if (performanceEnabled) {
            const started = performance.now();
            void this.wait()
              .then(() => measured("recalculate", started))
              .catch(() => {});
          }
        }
      },
    );
    this.selectionSubscription = this.api.addEvent(
      this.api.Event.SelectionMoveEnd,
      (e: any) => {
        const range = e.selections.at(-1);
        if (!range) return;
        const r = e.worksheet.getRange(
          range.startRow,
          range.startColumn,
          range.endRow - range.startRow + 1,
          range.endColumn - range.startColumn + 1,
        );
        this.onSelect?.(
          e.worksheet.getSheetId(),
          r.getA1Notation(),
          r.getFormula() || String(r.getValue() ?? ""),
          r.getFormula() ? calculationAdvice(r.getCellData()) : undefined,
        );
      },
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
        r.getFormula() ? calculationAdvice(r.getCellData()) : undefined,
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
    return this.api.undo();
  }
  redo() {
    return this.api.redo();
  }
  async ready() {
    await this.rendered;
    await this.wait();
  }
  startEditing() {
    return this.api.getActiveWorkbook().startEditing();
  }
  async commit() {
    if (this.composing) throw Error("输入法还在选字，确认文字后再写入或检查。");
    if (this.committing) return this.committing;
    const book = this.api.getActiveWorkbook();
    if (!book.isCellEditing()) return true;
    const target = { ...this.editor };
    this.committing = book.endEditingAsync(true).then(() => {
      const accepted = !book.isCellEditing();
      if (
        accepted &&
        target.active &&
        this.container.contains(document.activeElement)
      )
        this.focus(target.sheet, target.cell);
      return accepted;
    });
    try {
      return await this.committing!;
    } finally {
      this.committing = undefined;
    }
  }
  async cancelEditing() {
    return this.api.getActiveWorkbook().endEditingAsync(false);
  }
  async resolveInput(action: "equals" | "text" | "edit", revision: number) {
    if (!this.editor.active || revision !== this.editor.revision) return;
    const service = this.univer.__getInjector().get(IEditorService);
    const editor = service.getEditor(service.getFocusId());
    if (action === "text") {
      this.allowText = this.editor.text;
      await this.commit();
    } else if (
      action === "equals" &&
      this.editor.issue?.code === "missing-equals"
    ) {
      if (editor) {
        await this.api.executeCommand(InsertTextCommand.id, {
          unitId: editor.getEditorId(),
          body: { dataStream: "=" },
          range: { startOffset: 0, endOffset: 0, collapsed: true },
        });
        editor.focus();
      }
    } else editor?.focus();
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
    // While composing, sheet switches select references; the editing destination stays fixed.
    if (this.editor.active) return;
    s.getRange(range).activate();
    this.univer
      .__getInjector()
      .get(ILayoutService)
      .focus(this.api.getActiveWorkbook().getId());
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
    this.subscriptions.forEach((s) => s.dispose());
    this.subscription?.dispose();
    this.selectionSubscription?.dispose();
    this.univer.dispose();
    this.worker.terminate();
  }
}
