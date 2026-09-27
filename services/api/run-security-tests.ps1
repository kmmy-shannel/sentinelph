# services/api/run-security-tests.ps1
# SentinelPH - Section VII Security Testing
# NO hardcoded tokens. Pass them as parameters.

param(
    [string]$BaseUrl = "http://localhost:4000",
    [string]$OfficerToken = "",
    [string]$SuperadminToken = ""
)

$evidenceDir = "C:\Users\Kimmy\Project\sentinelph\docs\evidence\security-tests"
New-Item -ItemType Directory -Force -Path $evidenceDir | Out-Null

function Save-Result {
    param($Name, $Content)
    $path = "$evidenceDir\$Name.txt"
    $Content | Out-File -FilePath $path -Encoding utf8
    Write-Host "  saved: $Name.txt" -ForegroundColor Gray
}

function Test-Pass {
    param($Name, $Expected, $Content)
    if ($Content -match $Expected) {
        Write-Host "  PASS: $Name" -ForegroundColor Green
    } else {
        Write-Host "  FAIL: $Name (expected $Expected)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "  SentinelPH - Section VII Security Tests" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "Base URL: $BaseUrl" -ForegroundColor Gray
Write-Host ""

# Test 1 - Invalid registration data (validates against express-validator chain)
Write-Host "[Test 1] Invalid registration data" -ForegroundColor Yellow
$tmp = [System.IO.Path]::GetTempFileName()
[System.IO.File]::WriteAllText($tmp, '{"token":"short","newPassword":"weak"}', [System.Text.UTF8Encoding]::new($false))
$out = & curl.exe -i -s -X POST "$BaseUrl/api/v1/auth/confirm-password-reset" -H "Content-Type: application/json" --data-binary "@$tmp"
Remove-Item $tmp -ErrorAction SilentlyContinue
Save-Result "01-invalid-registration" $out
Test-Pass "Invalid registration" "400|VALIDATION_ERROR" $out

# Test 2 - Missing token
Write-Host ""
Write-Host "[Test 2] Unauthenticated request" -ForegroundColor Yellow
$out = & curl.exe -i -s "$BaseUrl/api/v1/auth/me"
Save-Result "02-invalid-login" $out
Test-Pass "Invalid login" "401" $out

# Test 3 - RBAC 403
Write-Host ""
Write-Host "[Test 3] Officer accessing admin route" -ForegroundColor Yellow
if ($OfficerToken) {
    $out = & curl.exe -i -s "$BaseUrl/api/v1/admin/officers" -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6ImVjMjdhOWI2YWEzMDg4ZDI3Y2FkYjFjNjRmYTJmYTQ1Y2Y5ZmQ5ZTciLCJ0eXAiOiJKV1QifQ.eyJuYW1lIjoiR3dlbiBNZW5kb3phIiwicm9sZSI6Im9mZmljZXIiLCJqdXJpc2RpY3Rpb24iOiJSZWdpb24gSSIsImlzcyI6Imh0dHBzOi8vc2VjdXJldG9rZW4uZ29vZ2xlLmNvbS9zZW50aW5lbHBoLTRhZTdjIiwiYXVkIjoic2VudGluZWxwaC00YWU3YyIsImF1dGhfdGltZSI6MTc4OTkwNDMzMiwidXNlcl9pZCI6IjROZWk3cGFUY1FaT2dpQWN4TFM2Q0UyM0VrUTIiLCJzdWIiOiI0TmVpN3BhVGNRWk9naUFjeExTNkNFMjNFa1EyIiwiaWF0IjoxNzg5OTE3MDUxLCJleHAiOjE3ODk5MjA2NTEsImVtYWlsIjoiZ3dlbnZpY3RvcmlhMTdAZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsImZpcmViYXNlIjp7ImlkZW50aXRpZXMiOnsiZW1haWwiOlsiZ3dlbnZpY3RvcmlhMTdAZ21haWwuY29tIl19LCJzaWduX2luX3Byb3ZpZGVyIjoicGFzc3dvcmQifX0.daLZY-i77Z0Gv-2xJ7ZlUMubDDabP5bgTkn7OcaXQuCNRrkZYd10VIqw6oVfYq2JwuyClrIQ3rGbrei6ZLCgT6kibvxelWsRp038jCF6XTRz6els4fu3wsiq3MuJOu0iAI2cohV0jDubXW8klVcCr66UPxsUzG5Gju1Jyb-bLqRKBw2SkRhuLLprQhysaBXyJr54DsYukfjfYUswC9JyPgc7qKQRg-uVcMAbxjoNOq2BJ7HU5CzowzEGesuoYDjZJT7bn7QXTG75c_TZjDgCiHOmYeANTlmOBFrcbQwYMzbBnSHIxKtEC9C__OpEPo3V_BpiSZb5Ndhsgz9MWALKzg"
    Save-Result "03-rbac-403" $out
    Test-Pass "RBAC 403" "403" $out
} else {
    Write-Host "  SKIPPED (no -OfficerToken provided)" -ForegroundColor Magenta
    "SKIPPED - no officer token provided" | Out-File "$evidenceDir\03-rbac-403.txt"
}

# Test 4 - Missing JWT
Write-Host ""
Write-Host "[Test 4] Missing JWT" -ForegroundColor Yellow
$out = & curl.exe -i -s "$BaseUrl/api/v1/reports"
Save-Result "04-missing-jwt" $out
Test-Pass "Missing JWT" "401" $out

# Test 5 - Invalid JWT
Write-Host ""
Write-Host "[Test 5] Malformed JWT" -ForegroundColor Yellow
$out = & curl.exe -i -s "$BaseUrl/api/v1/reports" -H "Authorization: Bearer invalid.token.here"
Save-Result "05-invalid-jwt" $out
Test-Pass "Invalid JWT" "401" $out

# Test 6 - Unauthorized DELETE
Write-Host ""
Write-Host "[Test 6] DELETE on append-only route" -ForegroundColor Yellow
$out = & curl.exe -i -s -X DELETE "$BaseUrl/api/v1/reports/507f1f77bcf86cd799439011"
Save-Result "06-unauthorized-delete" $out
Test-Pass "Unauthorized DELETE" "404|405" $out

# Test 7 - Invalid MongoDB ID
Write-Host ""
Write-Host "[Test 7] Invalid MongoDB ObjectId" -ForegroundColor Yellow
if ($SuperadminToken) {
    $out = & curl.exe -i -s "$BaseUrl/api/v1/auditor/logs/not-a-real-id" -H "Authorization: Bearer $SuperadminToken"
} else {
    $out = & curl.exe -i -s "$BaseUrl/api/v1/reports/not-a-real-id"
}
Save-Result "07-invalid-mongoid" $out
Test-Pass "Invalid MongoDB ID" "400|401" $out

# Test 8 - Rate limit
Write-Host ""
Write-Host "[Test 8] Rate limit (20 rapid requests)" -ForegroundColor Yellow
$codes = @()
$tmp = [System.IO.Path]::GetTempFileName()
[System.IO.File]::WriteAllText($tmp, '{"email":"ratelimit-test@test.com"}', [System.Text.UTF8Encoding]::new($false))

for ($i = 1; $i -le 20; $i++) {
    $code = & curl.exe -s -o $null -w "%{http_code}" -X POST "$BaseUrl/api/v1/auth/request-password-otp" -H "Content-Type: application/json" --data-binary "@$tmp"
    $codes += "Attempt $i : $code"
    Write-Host "  Attempt $i - $code" -ForegroundColor Gray
}
Remove-Item $tmp -ErrorAction SilentlyContinue
$codes | Out-File "$evidenceDir\08-rate-limit.txt" -Encoding utf8

if ($codes -match "RATE_LIMITED|429") {
    Write-Host "  PASS: Rate limiting working" -ForegroundColor Green
} else {
    Write-Host "  WARN: No 429 received" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "  Evidence saved to: $evidenceDir" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""

<# Ganito kunin ang firebase token ng officer
(async () => {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('firebaseLocalStorageDb');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const tx = db.transaction('firebaseLocalStorage', 'readonly');
  const store = tx.objectStore('firebaseLocalStorage');
  const all = await new Promise((res, rej) => {
    const r = store.getAll();
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const e = all.find(x => x.fbase_key?.startsWith('firebase:authUser:'));
  if (!e) {
    console.error('❌ No auth entry found in IndexedDB');
    return;
  }
  const token = e.value.stsTokenManager.accessToken;
  console.log('%c✅ TOKEN BELOW — SELECT AND COPY ⬇️', 'color: #22c55e; font-weight: bold; font-size: 14px;');
  console.log(token);
  console.log('%c⬆️ TOKEN ABOVE — right-click → Copy string contents', 'color: #22c55e;');
  console.log('Length:', token.length, 'chars');
})();


after getting the token, run the script like this:
PS C:\Users\Kimmy\Project\sentinelph\services\api>  .\run-security-tests.ps1 -OfficerToken "eyJhbGciOiJSUzI1NiIsImtpZCI6ImVjMjdhOWI2YWEzMDg4ZDI3Y2FkYjFjNjRmYTJ
mYTQ1Y2Y5ZmQ5ZTciLCJ0eXAiOiJKV1QifQ.eyJuYW1lIjoiR3dlbiBNZW5kb
3phIiwicm9sZSI6Im9mZmljZXIiLCJqdXJpc2RpY3Rpb24iOiJSZWdpb24gSSIsImlzcyI6Imh0dHB
zOi8vc2VjdXJldG9rZW4uZ29vZ2xlLmNvbS9zZW50aW5lbHBoLTRhZTdjIiwiYXVkIjoic2VudGluZWxwaC
00YWU3YyIsImF1dGhfdGltZSI6MTc4OTkwNDMzMiwidXNlcl9pZCI6IjROZWk3cGFUY1FaT2dpQWN4TFM2Q0UyM0
VrUTIiLCJzdWIiOiI0TmVpN3BhVGNRWk9naUFjeExTNkNFMjNFa1EyIiwiaWF0IjoxNzg5OTE4MTc5LCJleHAiOjE
3ODk5MjE3NzksImVtYWlsIjoiZ3dlbnZpY3RvcmlhMTdAZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsImZpcmV
iYXNlIjp7ImlkZW50aXRpZXMiOnsiZW1haWwiOlsiZ3dlbnZpY3RvcmlhMTdAZ21haWwuY29tIl19LCJzaWduX2luX3Byb3
ZpZGVyIjoicGFzc3dvcmQifX0.TVts8xT13SR2wV25s-qGibKk3tupGN8EtL3pMyjY2I7U6qcWgKWxPKB1A2F0D0p5AZb0b
jnTncVyduztexpi0ndI2EoiElqdDVhJClj1KGRcPI67EqUEOt_jkp5NAQBputIn6aD2TaYJEtuxL4agX83xR0NWMR__-eZY
2xQCckskVi5J5LMUe2kvn6-lHpTOV08NHvcUJ_BFLQ6v32_8_l_aDvU6IYJYHTa56D0HH4LR2chGAokZCmQLWKD0jS2JVBh
wb9Rxc3MP2Tza5xMI4PTmDQsO67RTC5DjLzoaCaObPXts0RggflPg9QldwlbUnky8nJ4bbk46oGMXu26FBw"
*to verify the expected results of the test, you musit open the evidence files 
in docs/evidence/security-tests and check the HTTP status codes and error messages.
Sample
Get-Content "C:\Users\Kimmy\Project\sentinelph\docs\evidence\security-tests\01-invalid-registration.txt"

#>