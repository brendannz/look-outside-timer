# Prints one JSON line every two seconds listing the processes currently
# streaming from a camera or capturing from a microphone:
#
#   {"cameraOk":true,"micOk":true,"camera":[["ms-teams.exe","MSTeams_8wekyb3d8bbwe"]],"mic":[...]}
#
# Each entry is every name the process answers to: its exe, its package family
# name if it has one, and, for WebView2 helpers, the app that hosts them.
#
# Recent Windows 11 builds (26H2 onward) stopped updating the ConsentStore
# registry timestamps while a device is in use, so this asks the device stacks
# directly: Media Foundation's sensor activity monitor for cameras and the
# WASAPI session list for microphones. Neither opens or reads from a device.
#
# Spawned and owned by callDetector.js. Exits when its stdout pipe closes.

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

namespace LookOutside {

  // --- Media Foundation sensor activity (camera) ---------------------------

  [ComImport, Guid("D0CEF145-B3F4-4340-A2E5-7A5080CA05CB"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IMFSensorActivityMonitor {
    [PreserveSig] int Start();
    [PreserveSig] int Stop();
  }

  [ComImport, Guid("DE5072EE-DBE3-46DC-8A87-B6F631194751"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IMFSensorActivitiesReportCallback {
    [PreserveSig] int OnActivitiesReport(IMFSensorActivitiesReport report);
  }

  [ComImport, Guid("683F7A5E-4A19-43CD-B1A9-DBF4AB3F7777"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IMFSensorActivitiesReport {
    [PreserveSig] int GetCount(out uint count);
    [PreserveSig] int GetActivityReport(uint index, out IMFSensorActivityReport report);
  }

  [ComImport, Guid("3E8C4BE1-A8C2-4528-90DE-2851BDE5FEAD"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IMFSensorActivityReport {
    [PreserveSig] int GetFriendlyName(IntPtr buffer, uint cch, out uint written);
    [PreserveSig] int GetSymbolicLink(IntPtr buffer, uint cch, out uint written);
    [PreserveSig] int GetProcessCount(out uint count);
    [PreserveSig] int GetProcessActivity(uint index, out IMFSensorProcessActivity activity);
  }

  [ComImport, Guid("39DC7F4A-B141-4719-813C-A7F46162A2B8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IMFSensorProcessActivity {
    [PreserveSig] int GetProcessId(out uint pid);
    [PreserveSig] int GetStreamingState([MarshalAs(UnmanagedType.Bool)] out bool streaming);
  }

  // --- WASAPI sessions (microphone) ----------------------------------------

  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
  public class MMDeviceEnumeratorCo { }

  [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IMMDeviceEnumerator {
    [PreserveSig] int EnumAudioEndpoints(int dataFlow, int stateMask, out IMMDeviceCollection devices);
  }

  [ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IMMDeviceCollection {
    [PreserveSig] int GetCount(out uint count);
    [PreserveSig] int Item(uint index, out IMMDevice device);
  }

  [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IMMDevice {
    [PreserveSig] int Activate(ref Guid iid, int clsCtx, IntPtr activationParams,
      [MarshalAs(UnmanagedType.IUnknown)] out object iface);
  }

  [ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IAudioSessionManager2 {
    [PreserveSig] int GetAudioSessionControl(IntPtr sessionGuid, int flags, out IntPtr control);
    [PreserveSig] int GetSimpleAudioVolume(IntPtr sessionGuid, int flags, out IntPtr volume);
    [PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator sessions);
  }

  [ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IAudioSessionEnumerator {
    [PreserveSig] int GetCount(out int count);
    [PreserveSig] int GetSession(int index, [MarshalAs(UnmanagedType.IUnknown)] out object session);
  }

  [ComImport, Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IAudioSessionControl2 {
    [PreserveSig] int GetState(out int state);
    [PreserveSig] int GetDisplayName(out IntPtr name);
    [PreserveSig] int SetDisplayName(IntPtr name, IntPtr context);
    [PreserveSig] int GetIconPath(out IntPtr path);
    [PreserveSig] int SetIconPath(IntPtr path, IntPtr context);
    [PreserveSig] int GetGroupingParam(out Guid param);
    [PreserveSig] int SetGroupingParam(IntPtr param, IntPtr context);
    [PreserveSig] int RegisterAudioSessionNotification(IntPtr client);
    [PreserveSig] int UnregisterAudioSessionNotification(IntPtr client);
    [PreserveSig] int GetSessionIdentifier(out IntPtr id);
    [PreserveSig] int GetSessionInstanceIdentifier(out IntPtr id);
    [PreserveSig] int GetProcessId(out uint pid);
  }

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct PROCESSENTRY32W {
    public uint dwSize, cntUsage, th32ProcessID;
    public IntPtr th32DefaultHeapID;
    public uint th32ModuleID, cntThreads, th32ParentProcessID;
    public int pcPriClassBase;
    public uint dwFlags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string szExeFile;
  }

  public class Watcher : IMFSensorActivitiesReportCallback {
    [DllImport("mfplat.dll")] static extern int MFStartup(uint version, uint flags);
    [DllImport("mfsensorgroup.dll")] static extern int MFCreateSensorActivityMonitor(
      IMFSensorActivitiesReportCallback callback, out IMFSensorActivityMonitor monitor);
    [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint pid);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool Process32FirstW(IntPtr snap, ref PROCESSENTRY32W entry);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool Process32NextW(IntPtr snap, ref PROCESSENTRY32W entry);
    [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern int GetPackageFamilyName(IntPtr process, ref uint length, StringBuilder name);

    IMFSensorActivityMonitor monitor;
    readonly object gate = new object();
    HashSet<uint> cameraPids = new HashSet<uint>();
    public bool CameraOk;
    public bool MicOk;
    public string CameraError = "";

    public Watcher() {
      try {
        MFStartup(0x00020070, 0);
        int hr = MFCreateSensorActivityMonitor(this, out monitor);
        if (hr < 0) throw new COMException("MFCreateSensorActivityMonitor", hr);
        hr = monitor.Start();
        if (hr < 0) throw new COMException("IMFSensorActivityMonitor.Start", hr);
        CameraOk = true;
      } catch (Exception e) {
        CameraError = e.Message;
      }
    }

    public int OnActivitiesReport(IMFSensorActivitiesReport report) {
      HashSet<uint> pids = new HashSet<uint>();
      try {
        uint devices;
        report.GetCount(out devices);
        for (uint d = 0; d < devices; d++) {
          IMFSensorActivityReport device;
          if (report.GetActivityReport(d, out device) < 0) continue;
          uint procs;
          device.GetProcessCount(out procs);
          for (uint p = 0; p < procs; p++) {
            IMFSensorProcessActivity activity;
            if (device.GetProcessActivity(p, out activity) < 0) continue;
            uint pid;
            bool streaming;
            activity.GetProcessId(out pid);
            activity.GetStreamingState(out streaming);
            if (streaming) pids.Add(pid);
          }
        }
      } catch { }
      lock (gate) { cameraPids = pids; }
      return 0;
    }

    HashSet<uint> MicPids() {
      HashSet<uint> pids = new HashSet<uint>();
      IMMDeviceEnumerator enumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorCo();
      IMMDeviceCollection devices;
      // eCapture = 1, DEVICE_STATE_ACTIVE = 1
      Marshal.ThrowExceptionForHR(enumerator.EnumAudioEndpoints(1, 1, out devices));
      uint count;
      devices.GetCount(out count);
      Guid iid = typeof(IAudioSessionManager2).GUID;
      for (uint i = 0; i < count; i++) {
        IMMDevice device;
        if (devices.Item(i, out device) < 0) continue;
        object raw;
        // CLSCTX_ALL = 23
        if (device.Activate(ref iid, 23, IntPtr.Zero, out raw) < 0) continue;
        IAudioSessionEnumerator sessions;
        if (((IAudioSessionManager2)raw).GetSessionEnumerator(out sessions) < 0) continue;
        int n;
        sessions.GetCount(out n);
        for (int s = 0; s < n; s++) {
          object rawSession;
          if (sessions.GetSession(s, out rawSession) < 0) continue;
          IAudioSessionControl2 session = rawSession as IAudioSessionControl2;
          if (session == null) continue;
          int state;
          uint pid;
          // AudioSessionStateActive = 1
          if (session.GetState(out state) >= 0 && state == 1 &&
              session.GetProcessId(out pid) >= 0 && pid != 0) {
            pids.Add(pid);
          }
        }
      }
      return pids;
    }

    static string PackageOf(uint pid) {
      // PROCESS_QUERY_LIMITED_INFORMATION
      IntPtr h = OpenProcess(0x1000, false, pid);
      if (h == IntPtr.Zero) return null;
      try {
        uint len = 256;
        StringBuilder sb = new StringBuilder((int)len);
        return GetPackageFamilyName(h, ref len, sb) == 0 ? sb.ToString() : null;
      } finally { CloseHandle(h); }
    }

    static Dictionary<uint, PROCESSENTRY32W> ProcessTable() {
      Dictionary<uint, PROCESSENTRY32W> table = new Dictionary<uint, PROCESSENTRY32W>();
      // TH32CS_SNAPPROCESS
      IntPtr snap = CreateToolhelp32Snapshot(2, 0);
      if (snap == new IntPtr(-1)) return table;
      try {
        PROCESSENTRY32W e = new PROCESSENTRY32W();
        e.dwSize = (uint)Marshal.SizeOf(typeof(PROCESSENTRY32W));
        if (Process32FirstW(snap, ref e)) {
          do { table[e.th32ProcessID] = e; } while (Process32NextW(snap, ref e));
        }
      } finally { CloseHandle(snap); }
      return table;
    }

    // Every name a process answers to. WebView2 helpers do the actual capture
    // for apps such as new Teams, so walk up to the app that hosts them.
    static List<string> NamesOf(uint pid, Dictionary<uint, PROCESSENTRY32W> table) {
      List<string> names = new List<string>();
      uint current = pid;
      for (int depth = 0; depth < 6; depth++) {
        PROCESSENTRY32W e;
        if (!table.TryGetValue(current, out e)) break;
        if (!names.Contains(e.szExeFile)) names.Add(e.szExeFile);
        string pkg = PackageOf(current);
        if (pkg != null && !names.Contains(pkg)) names.Add(pkg);
        if (!e.szExeFile.Equals("msedgewebview2.exe", StringComparison.OrdinalIgnoreCase)) break;
        current = e.th32ParentProcessID;
      }
      // An empty list means the process has already exited.
      return names;
    }

    static string Json(string s) {
      StringBuilder sb = new StringBuilder("\"");
      foreach (char c in s) {
        if (c == '"' || c == '\\') sb.Append('\\').Append(c);
        else if (c < ' ') sb.AppendFormat("\\u{0:x4}", (int)c);
        else sb.Append(c);
      }
      return sb.Append('"').ToString();
    }

    static string JsonList(HashSet<uint> pids, Dictionary<uint, PROCESSENTRY32W> table) {
      List<string> items = new List<string>();
      foreach (uint pid in pids) {
        List<string> names = NamesOf(pid, table);
        if (names.Count == 0) continue;
        items.Add("[" + string.Join(",", names.ConvertAll(Json).ToArray()) + "]");
      }
      return "[" + string.Join(",", items.ToArray()) + "]";
    }

    public string Snapshot() {
      HashSet<uint> mic;
      try { mic = MicPids(); MicOk = true; }
      catch { mic = new HashSet<uint>(); MicOk = false; }
      HashSet<uint> cam;
      lock (gate) { cam = cameraPids; }
      Dictionary<uint, PROCESSENTRY32W> table = ProcessTable();
      return "{\"cameraOk\":" + (CameraOk ? "true" : "false") +
        ",\"micOk\":" + (MicOk ? "true" : "false") +
        ",\"camera\":" + JsonList(cam, table) +
        ",\"mic\":" + JsonList(mic, table) + "}";
    }
  }
}
'@

$watcher = New-Object LookOutside.Watcher
if (-not $watcher.CameraOk) { [Console]::Error.WriteLine("camera monitor unavailable: $($watcher.CameraError)") }

while ($true) {
  [Console]::Out.WriteLine($watcher.Snapshot())
  [Console]::Out.Flush()
  Start-Sleep -Milliseconds 2000
}
