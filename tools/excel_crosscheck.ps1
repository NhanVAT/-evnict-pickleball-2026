# Điền tỷ số vào BẢN SAO file Excel chính thức (sheet Đôi Nam), cho Excel tính lại,
# rồi xuất bảng xếp hạng + nhánh đấu ra JSON để test so với engine.js.
param(
  [Parameter(Mandatory)][string]$Xlsx,
  [Parameter(Mandatory)][string]$ScoresJson,
  [Parameter(Mandatory)][string]$OutJson
)
$scores = Get-Content $ScoresJson -Raw -Encoding UTF8 | ConvertFrom-Json
$tmp = Join-Path $env:TEMP 'pb-crosscheck.xlsx'
Copy-Item -LiteralPath $Xlsx $tmp -Force
$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false; $xl.DisplayAlerts = $false
try {
  $wb = $xl.Workbooks.Open($tmp)
  $ws = $wb.Worksheets.Item('Đôi Nam')
  for ($i = 0; $i -lt 18; $i++) {
    $s = $scores.('MD-G{0:D2}' -f ($i + 1)); $r = 24 + $i
    $ws.Cells.Item($r, 6).Value2 = $s[0]; $ws.Cells.Item($r, 7).Value2 = $s[1]
  }
  $ko = 'MD-QF1', 'MD-QF2', 'MD-QF3', 'MD-QF4', 'MD-SF1', 'MD-SF2', 'MD-F'
  for ($i = 0; $i -lt 7; $i++) {
    $s = $scores.($ko[$i]); $r = 75 + $i
    $ws.Cells.Item($r, 4).Value2 = $s[0]; $ws.Cells.Item($r, 5).Value2 = $s[1]
  }
  $xl.CalculateFull()
  $standings = [ordered]@{}
  foreach ($b in @(@('A', 47, 4), @('B', 54, 4), @('C', 61, 3), @('D', 67, 3))) {
    $rows = @()
    for ($k = 0; $k -lt $b[2]; $k++) {
      $r = $b[1] + $k
      $rows += [ordered]@{
        code = $ws.Cells.Item($r, 1).Text; pts = [int]$ws.Cells.Item($r, 6).Value2
        pf = [int]$ws.Cells.Item($r, 7).Value2; diff = [int]$ws.Cells.Item($r, 9).Value2
        rank = [int]$ws.Cells.Item($r, 11).Value2
      }
    }
    $standings[$b[0]] = $rows
  }
  $knockout = [ordered]@{}
  for ($i = 0; $i -lt 7; $i++) {
    $r = 75 + $i
    $knockout[$ko[$i]] = [ordered]@{ team1 = $ws.Cells.Item($r, 3).Text; team2 = $ws.Cells.Item($r, 6).Text; winner = $ws.Cells.Item($r, 7).Text }
  }
  $final = [ordered]@{ champion = $ws.Cells.Item(84, 3).Text; runnerUp = $ws.Cells.Item(85, 3).Text; thirds = $ws.Cells.Item(86, 3).Text }
  [ordered]@{ standings = $standings; knockout = $knockout; final = $final } | ConvertTo-Json -Depth 6 | Set-Content $OutJson -Encoding UTF8
  $wb.Close($false)
} finally {
  $xl.Quit()
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($xl)
  Remove-Item $tmp -ErrorAction SilentlyContinue
}
