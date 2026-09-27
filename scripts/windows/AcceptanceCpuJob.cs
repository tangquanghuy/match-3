using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
public static class AcceptanceCpuJob {
  [StructLayout(LayoutKind.Sequential)] struct CpuInfo { public UInt32 Flags, Rate; }
  [StructLayout(LayoutKind.Sequential)] struct BasicLimits {
    public Int64 ProcessTime, JobTime; public UInt32 Flags;
    public UIntPtr MinWorkingSet, MaxWorkingSet; public UInt32 ActiveLimit;
    public UIntPtr Affinity; public UInt32 Priority, Scheduling;
  }
  [StructLayout(LayoutKind.Sequential)] struct IoCounters { public UInt64 A,B,C,D,E,F; }
  [StructLayout(LayoutKind.Sequential)] struct ExtendedLimits {
    public BasicLimits Basic; public IoCounters Io;
    public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
  }
  [StructLayout(LayoutKind.Sequential)] public struct Accounting {
    public Int64 UserTime, KernelTime, PeriodUserTime, PeriodKernelTime;
    public UInt32 PageFaults, TotalProcesses, ActiveProcesses, TerminatedProcesses;
  }
  [StructLayout(LayoutKind.Sequential)] struct FileTime { public UInt32 Low,High; public UInt64 Value { get { return ((UInt64)High << 32) | Low; } } }
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr security,string name);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int type,IntPtr info,UInt32 size);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr job,int type,IntPtr info,UInt32 size,IntPtr returned);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool IsProcessInJob(IntPtr process,IntPtr job,out bool inside);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetSystemTimes(out FileTime idle,out FileTime kernel,out FileTime user);
  [DllImport("kernel32.dll",SetLastError=true)] public static extern bool TerminateJobObject(IntPtr job,UInt32 exitCode);
  static void Set<T>(IntPtr job,int type,T value) {
    int size=Marshal.SizeOf(typeof(T)); IntPtr p=Marshal.AllocHGlobal(size);
    try { Marshal.StructureToPtr(value,p,false); if(!SetInformationJobObject(job,type,p,(UInt32)size))throw new Win32Exception(); }
    finally { Marshal.FreeHGlobal(p); }
  }
  static T Get<T>(IntPtr job,int type) {
    int size=Marshal.SizeOf(typeof(T)); IntPtr p=Marshal.AllocHGlobal(size);
    try { if(!QueryInformationJobObject(job,type,p,(UInt32)size,IntPtr.Zero))throw new Win32Exception(); return (T)Marshal.PtrToStructure(p,typeof(T)); }
    finally { Marshal.FreeHGlobal(p); }
  }
  public static IntPtr Create(string name,int percent) {
    if(percent<1||percent>50)throw new ArgumentOutOfRangeException("percent");
    IntPtr job=CreateJobObject(IntPtr.Zero,name);if(job==IntPtr.Zero)throw new Win32Exception();
    var limits=new ExtendedLimits();limits.Basic.Flags=0x2000|0x20;limits.Basic.Priority=0x4000;
    Set(job,9,limits); // Kill this recording tree if its owning wrapper exits; BelowNormal priority.
    Set(job,15,new CpuInfo{Flags=1|4,Rate=(UInt32)(percent*100)}); // ENABLE | HARD_CAP.
    if(!AssignProcessToJobObject(job,Process.GetCurrentProcess().Handle))throw new Win32Exception();
    return job;
  }
  public static void Attach(IntPtr job,int pid) { using(var p=Process.GetProcessById(pid)){if(!AssignProcessToJobObject(job,p.Handle))throw new Win32Exception();} }
  public static int ReadCap(IntPtr job) { var x=Get<CpuInfo>(job,15);if(x.Flags!=5)throw new Exception("Hard cap not active");return (int)x.Rate/100; }
  public static Accounting ReadAccounting(IntPtr job) { return Get<Accounting>(job,1); }
  public static bool Contains(IntPtr job,int pid) { bool inside; using(var p=Process.GetProcessById(pid)){if(!IsProcessInJob(p.Handle,job,out inside))throw new Win32Exception();}return inside; }
  public static UInt64[] SystemTimes() { FileTime i,k,u;if(!GetSystemTimes(out i,out k,out u))throw new Win32Exception();return new UInt64[]{i.Value,k.Value+u.Value}; }
}