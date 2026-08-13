function Show-Tree([int]$procId, [int]$depth = 0) {
  $p = Get-CimInstance Win32_Process -Filter "ProcessId=$procId" -ErrorAction SilentlyContinue
  if (-not $p) { return }
  $indent = '  ' * $depth
  Write-Output ("{0}PID={1} PPID={2} CMD={3}" -f $indent, $p.ProcessId, $p.ParentProcessId, $p.CommandLine)
  if ($depth -lt 6) { Show-Tree $p.ParentProcessId ($depth + 1) }
}

# Everything on port 4000
Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { Write-Output "=== Port 4000 owned by PID $_ ==="; Show-Tree $_ }
