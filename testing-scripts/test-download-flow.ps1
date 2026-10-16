# Run with: powershell -ExecutionPolicy Bypass -File test-download-flow.ps1
# Logs in as test3@example.com (handles the OTP challenge), then requests a
# download and checks quota. Run the SQL upgrade snippet in Neon first so
# this account is on BRONZE and can access the Bronze-gated seed video.

$base = "http://localhost:4000/api/v1"
$email = "test3@example.com"
$password = "password123"
$videoId = "cccccccc-cccc-cccc-cccc-cccccccccccc"  # IAM Privilege Escalation Paths (BRONZE-gated)

$session = $null
Write-Host "`n--- Logging in ---" -ForegroundColor Cyan
$loginBody = @{ email = $email; password = $password } | ConvertTo-Json
$loginResponse = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -Body $loginBody -ContentType "application/json" -SessionVariable session
$loginResponse | ConvertTo-Json
$userId = $loginResponse.userId

if ($loginResponse.requiresOtp) {
  Write-Host "`nCheck your npm run dev terminal for the MOCK EMAIL login code." -ForegroundColor Yellow
  $loginOtp = Read-Host "Paste the login OTP here"
  $confirmBody = @{ userId = $userId; otp = $loginOtp; purpose = "login" } | ConvertTo-Json
  $confirmResponse = Invoke-RestMethod -Uri "$base/auth/verify-otp" -Method Post -Body $confirmBody -ContentType "application/json" -WebSession $session
  Write-Host "`n--- OTP confirmed ---" -ForegroundColor Cyan
  $confirmResponse | ConvertTo-Json
}

Write-Host "`n--- Requesting download ---" -ForegroundColor Cyan
$downloadBody = @{ videoId = $videoId } | ConvertTo-Json
try {
  $downloadResponse = Invoke-RestMethod -Uri "$base/downloads" -Method Post -Body $downloadBody -ContentType "application/json" -WebSession $session
  $downloadResponse | ConvertTo-Json
} catch {
  Write-Host "Download request failed:" -ForegroundColor Red
  $_.ErrorDetails.Message
}

Write-Host "`n--- Checking quota ---" -ForegroundColor Cyan
$quota = Invoke-RestMethod -Uri "$base/downloads/quota" -WebSession $session
$quota | ConvertTo-Json

Write-Host "`nDone." -ForegroundColor Green
