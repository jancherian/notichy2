$code = @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

public class WindowInfo {
    public int Pid { get; set; }
    public string ProcessName { get; set; }
    public IntPtr Hwnd { get; set; }
    public string Title { get; set; }
    public string ClassName { get; set; }
    public bool IsVisible { get; set; }
    public RECT Rect { get; set; }

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    public static List<WindowInfo> GetWindows(HashSet<uint> targetPids) {
        var list = new List<WindowInfo>();
        EnumWindows((hWnd, lParam) => {
            uint pid;
            GetWindowThreadProcessId(hWnd, out pid);
            if (targetPids.Contains(pid)) {
                bool visible = IsWindowVisible(hWnd);
                var titleSb = new StringBuilder(256);
                GetWindowText(hWnd, titleSb, titleSb.Capacity);
                var classSb = new StringBuilder(256);
                GetClassName(hWnd, classSb, classSb.Capacity);
                RECT r;
                GetWindowRect(hWnd, out r);
                
                string procName = "";
                try {
                    procName = Process.GetProcessById((int)pid).ProcessName;
                } catch {}

                list.Add(new WindowInfo {
                    Pid = (int)pid,
                    ProcessName = procName,
                    Hwnd = hWnd,
                    Title = titleSb.ToString(),
                    ClassName = classSb.ToString(),
                    IsVisible = visible,
                    Rect = r
                });
            }
            return true;
        }, IntPtr.Zero);
        return list;
    }
}
'@

Add-Type -TypeDefinition $code

# Collect notch and related msedgewebview2 PIDs
$pids = [System.Collections.Generic.HashSet[uint32]]::new()
Get-Process notch, coucou -ErrorAction SilentlyContinue | ForEach-Object { [void]$pids.Add([uint32]$_.Id) }
Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'msedgewebview2.exe' -and $_.CommandLine -match 'Notch|ergonotch' } | ForEach-Object { [void]$pids.Add([uint32]$_.ProcessId) }

Write-Output "Matching PIDs: $($pids -join ', ')"

$windows = [WindowInfo]::GetWindows($pids)


Write-Output "`n=== ALL WINDOWS OWNED BY NOTCH / WEBVIEW2 ==="
$windows | ForEach-Object {
    $w = $_.Rect.Right - $_.Rect.Left
    $h = $_.Rect.Bottom - $_.Rect.Top
    [PSCustomObject]@{
        PID = $_.Pid
        Process = $_.ProcessName
        Title = $_.Title
        ClassName = $_.ClassName
        Visible = $_.IsVisible
        Rect = "$($_.Rect.Left),$($_.Rect.Top) ($($w)x$($h))"
        Hwnd = "0x$($_.Hwnd.ToString('X'))"
    }
} | Format-Table -AutoSize
