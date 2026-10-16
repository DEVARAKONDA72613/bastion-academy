# Run with: powershell -ExecutionPolicy Bypass -File test-auth-flow.ps1
# Walks through register -> verify OTP -> login -> verify OTP -> fetch profile.
# Watch your `npm run dev` terminal for the MOCK EMAIL blocks containing codes.

$base = "http://localhost:4000/api/v1"
$email = "test3@example.com"
$password = "password123"

Write-Host "`n--- Registering $email ---" -ForegroundColor Cyan
$registerBody = @{ email = $email; password = $password; displayName = "Test User 3" } | ConvertTo-Json
$registerResponse = Invoke-RestMethod -Uri "$base/auth/register" -Method Post -Body $registerBody -ContentType "application/json"
$registerResponse | ConvertTo-Json
$userId = $registerResponse.userId

Write-Host "`nCheck your npm run dev terminal for the MOCK EMAIL registration code." -ForegroundColor Yellow
$regOtp = Read-Host "Paste the registration OTP here"

Write-Host "`n--- Verifying registration OTP ---" -ForegroundColor Cyan
$verifyBody = @{ userId = $userId; otp = $regOtp; purpose = "registration" } | ConvertTo-Json
$verifyResponse = Invoke-RestMethod -Uri "$base/auth/verify-otp" -Method Post -Body $verifyBody -ContentType "application/json"
$verifyResponse | ConvertTo-Json

Write-Host "`n--- Logging in ---" -ForegroundColor Cyan
$session = @{}
$loginBody = @{ email = $email; password = $password } | ConvertTo-Json
$loginResponse = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -Body $loginBody -ContentType "application/json" -SessionVariable session
$loginResponse | ConvertTo-Json

if ($loginResponse.requiresOtp) {
  Write-Host "`nCheck your npm run dev terminal for the MOCK EMAIL login code." -ForegroundColor Yellow
  $loginOtp = Read-Host "Paste the login OTP here"

  Write-Host "`n--- Verifying login OTP ---" -ForegroundColor Cyan
  $confirmBody = @{ userId = $userId; otp = $loginOtp; purpose = "login" } | ConvertTo-Json
  $confirmResponse = Invoke-RestMethod -Uri "$base/auth/verify-otp" -Method Post -Body $confirmBody -ContentType "application/json" -WebSession $session
  $confirmResponse | ConvertTo-Json
}

Write-Host "`n--- Fetching profile with session cookie ---" -ForegroundColor Cyan
$me = Invoke-RestMethod -Uri "$base/users/me" -WebSession $session
$me | ConvertTo-Json

Write-Host "`nDone." -ForegroundColor Green
