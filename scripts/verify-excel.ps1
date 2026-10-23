param(
  [string]$InputFile = 'outputs/pr03/excel-input.json',
  [string]$OutputFile = 'outputs/pr03/excel-capture.json'
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$inputPath = (Resolve-Path -LiteralPath $InputFile).Path
$outputPath = [IO.Path]::GetFullPath($OutputFile)
$corpus = Get-Content -LiteralPath $inputPath -Raw | ConvertFrom-Json -AsHashtable
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class ExcelOraclePid {
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr handle, out uint processId);
}
'@
function Release-Com($value) {
  if ($null -ne $value -and [Runtime.InteropServices.Marshal]::IsComObject($value)) {
    [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($value)
  }
}
function Write-Cell($sheet, [string]$address, $value) {
  $cell = $sheet.Range($address)
  try {
    if ($null -eq $value) { $cell.ClearContents() | Out-Null }
    elseif ($value -is [string] -and $value.StartsWith('=')) { $cell.NumberFormat = $script:generalFormat; $cell.Formula2 = $value }
    elseif ($value -is [string]) { $cell.NumberFormat = '@'; $cell.Value2 = $value }
    elseif ($value -is [bool]) { $cell.Value2 = $value }
    else { $cell.Value2 = [double]$value }
  } catch { throw "写入 $($sheet.Name)!$address [$value] 失败：$($_.Exception.Message)" }
  finally { Release-Com $cell }
}
function Get-Address([int]$row, [int]$column) {
  $letters = ''
  for ($n = $column; $n -gt 0; $n = [int][Math]::Floor(($n - 1) / 26)) { $letters = [char](65 + (($n - 1) % 26)) + $letters }
  return "$letters$row"
}
$before = @(Get-Process EXCEL -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
$app = $null; $book = $null; $owned = $false; $sheets = @{}
$results = [Collections.Generic.List[object]]::new()
try {
  # CoCreateInstance only: never attach to GetActiveObject or enumerate user workbooks.
  $app = New-Object -ComObject Excel.Application
  [uint32]$excelPid = 0
  [void][ExcelOraclePid]::GetWindowThreadProcessId([IntPtr]$app.Hwnd, [ref]$excelPid)
  if ($excelPid -eq 0 -or $before -contains $excelPid) { throw '无法证明 Excel 进程独立，未操作任何工作簿。' }
  $owned = $true
  $app.Visible = $false; $app.DisplayAlerts = $false; $app.AutomationSecurity = 3; $app.AskToUpdateLinks = $false
  $environment = [ordered]@{ application = 'Microsoft Excel'; version = [string]$app.Version;
    build = [string]$app.Build; fileVersion = (Get-Process -Id $excelPid).MainModule.FileVersionInfo.FileVersion;
    calculationVersion = $app.CalculationVersion; platform = 'Windows'; independentProcess = $true;
    calculation = 'Application.CalculateFullRebuild'; formulaProperty = 'Formula2' }
  foreach ($case in $corpus.cases) {
    $book = $app.Workbooks.Add(-4167)
    $defaultSheet = $book.Worksheets.Item(1); $defaultCell = $defaultSheet.Range('A1')
    $script:generalFormat = $defaultCell.NumberFormat
    Release-Com $defaultCell; Release-Com $defaultSheet
    $book.Date1904 = $case.input.dateSystem -eq '1904'
    $app.Calculation = -4135
    $sheets = @{}
    try {
      for ($i = 0; $i -lt $case.input.sheets.Count; $i++) {
        $seed = $case.input.sheets[$i]
        $sheet = if ($i -eq 0) { $book.Worksheets.Item(1) } else { $book.Worksheets.Add() }
        $sheet.Name = $seed.name; $sheets[$seed.id] = $sheet
      }
      foreach ($seed in $case.input.sheets) {
        $sheet = $sheets[$seed.id]
        for ($r = 0; $r -lt $seed.rows.Count; $r++) {
          for ($c = 0; $c -lt $seed.rows[$r].Count; $c++) {
            Write-Cell $sheet (Get-Address ($r + 1) ($c + 1)) $seed.rows[$r][$c]
          }
        }
      }
      foreach ($entry in $case.input.formulas.GetEnumerator()) {
        $parts = $entry.Key.Split('!', 2); Write-Cell $sheets[$parts[0]] $parts[1] $entry.Value
      }
      foreach ($change in $case.input.changes) { Write-Cell $sheets[$change.sheet] $change.cell $change.value }
      foreach ($fill in $case.input.fills) {
        $range = $sheets[$fill.sheet].Range($fill.range)
        try { if ($fill.direction -eq 'down') { $range.FillDown() | Out-Null } else { $range.FillRight() | Out-Null } }
        finally { Release-Com $range }
      }
      $app.CalculateFullRebuild()
      $deadline = [DateTime]::UtcNow.AddSeconds(20)
      while ($app.CalculationState -ne 0) {
        if ([DateTime]::UtcNow -gt $deadline) { throw "计算超时：$($case.id)" }
        Start-Sleep -Milliseconds 50
      }
      $cells = [Collections.Generic.List[object]]::new()
      foreach ($seed in $case.input.sheets) {
        $sheet = $sheets[$seed.id]; $used = $sheet.UsedRange
        try {
          for ($r = 1; $r -le $used.Row + $used.Rows.Count - 1; $r++) {
            for ($c = 1; $c -le $used.Column + $used.Columns.Count - 1; $c++) {
              $address = Get-Address $r $c
              $cell = $sheet.Range($address)
              try {
                $target = @($case.targets | Where-Object { $_.sheet -eq $seed.id -and $_.cell -eq $address }).Count -gt 0
                if (-not $cell.HasFormula -and -not $target) { continue }
                $value = $cell.Value2; $errorType = $null; $errorText = $null
                if ($sheet.Evaluate("ISERROR($address)")) {
                  $type = 'error'; $errorType = [int]$sheet.Evaluate("ERROR.TYPE($address)"); $errorText = [string]$cell.Text; $value = $null
                } elseif ($null -eq $value) { $type = 'blank' }
                elseif ($value -is [bool]) { $type = 'boolean' }
                elseif ($value -is [string]) { $type = 'string' }
                else { $type = 'number' }
                $cells.Add([ordered]@{ sheet = $seed.id; cell = $address; formula = if ($cell.HasFormula) { [string]$cell.Formula2 } else { $null };
                  type = $type; value = $value; errorType = $errorType; errorText = $errorText })
              } finally { Release-Com $cell }
            }
          }
        } finally { Release-Com $used }
      }
      $results.Add([ordered]@{ case = $case; verifiedAt = [DateTime]::UtcNow.ToString('o'); dateSystem = if ($book.Date1904) { '1904' } else { '1900' }; cells = $cells.ToArray() })
      Write-Host "$($case.id): $($cells.Count) cells calculated"
    } finally {
      foreach ($sheet in $sheets.Values) { Release-Com $sheet }; $sheets = @{}
      $book.Close($false); Release-Com $book; $book = $null
    }
  }
  $capture = [ordered]@{ format = 1; inputSha256 = (Get-FileHash -LiteralPath $inputPath -Algorithm SHA256).Hash.ToLowerInvariant();
    environment = $environment; cases = $results.ToArray() }
  [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($outputPath)) | Out-Null
  # Write once only after every case completed; failures never replace the committed oracle.
  [IO.File]::WriteAllText($outputPath, (($capture | ConvertTo-Json -Depth 100).Replace("`r`n", "`n")), [Text.UTF8Encoding]::new($false))
  Write-Host "Captured $($results.Count) cases to $outputPath"
} finally {
  if ($owned) { if ($book) { $book.Close($false) }; $app.Quit() }
  foreach ($sheet in $sheets.Values) { Release-Com $sheet }
  Release-Com $book; Release-Com $app
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}
