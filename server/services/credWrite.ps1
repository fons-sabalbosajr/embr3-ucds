# Writes one Windows credential — the kind `cmdkey /add` creates
# (CRED_TYPE_DOMAIN_PASSWORD) — persisted for the account this server runs as,
# replacing any existing entry for the target.
#
# Everything comes from the environment: EU_CRED_TARGET (the host name),
# EU_CRED_USER (DOMAIN\user) and EU_CRED_PASSWORD. No command line carries any
# of them, and nothing is parsed, which is why this exists instead of cmdkey:
# cmdkey parses its raw command line itself, rejects a quoted user name with a
# space while exiting 0, and cannot take a password containing a quote at all.
#
# Invoked by services/nasContainers.js applyToWindows(). Prints OK on success.

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class EuCred {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct CREDENTIAL {
    public uint Flags; public uint Type; public string TargetName; public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public uint CredentialBlobSize; public IntPtr CredentialBlob; public uint Persist;
    public uint AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName;
  }
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CredWrite(ref CREDENTIAL credential, uint flags);
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CredDelete(string target, uint type, uint flags);
  public static int Write(string target, string user, string password) {
    CredDelete(target, 2, 0);
    byte[] blob = System.Text.Encoding.Unicode.GetBytes(password);
    CREDENTIAL c = new CREDENTIAL();
    c.Type = 2; c.TargetName = target; c.UserName = user; c.Persist = 2;
    c.CredentialBlobSize = (uint)blob.Length; c.CredentialBlob = Marshal.AllocHGlobal(blob.Length);
    Marshal.Copy(blob, 0, c.CredentialBlob, blob.Length);
    bool ok = CredWrite(ref c, 0);
    int err = ok ? 0 : Marshal.GetLastWin32Error();
    Marshal.FreeHGlobal(c.CredentialBlob);
    return err;
  }
}
'@

if (-not $env:EU_CRED_TARGET -or -not $env:EU_CRED_USER -or $null -eq $env:EU_CRED_PASSWORD) {
  Write-Output 'Missing EU_CRED_TARGET, EU_CRED_USER or EU_CRED_PASSWORD'
  exit 2
}

$err = [EuCred]::Write($env:EU_CRED_TARGET, $env:EU_CRED_USER, $env:EU_CRED_PASSWORD)
if ($err -ne 0) {
  Write-Output ("CredWrite failed with Win32 error " + $err)
  exit 1
}
Write-Output 'OK'
