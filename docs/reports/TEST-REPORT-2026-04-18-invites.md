# Invites + Invite Links — Stress Test Report

Date: 2026-04-18  
API: `https://larry-site-production.up.railway.app`  
Project: `98a13baf-7d29-4d55-8d79-e044db220fd0`  
Admin: `launch-test-2026@larry-pm.com`  
Invitee under test: `oreillferg3@gmail.com`  

**Summary:** 13/13 passed, 0 failed.

## Scenarios

- **PASS — 1. create tenant-only invite**
  ```json
  {
  "status": 201,
  "hasUrl": true
}
  ```
- **PASS — 2. create project-scoped invite**
  ```json
  {
  "status": 201,
  "projectId": "98a13baf-7d29-4d55-8d79-e044db220fd0",
  "projectRole": "editor"
}
  ```
- **PASS — 3. preview surfaces project**
  ```json
  {
  "status": 200,
  "projectName": "Invite Stress Test 2026-04-18"
}
  ```
- **PASS — 4. invite oreillferg3@gmail.com**
  ```json
  {
  "status": 201,
  "inviteUrl": "https://www.larry-pm.com/invite/accept?token=1bC5fmbwWMgd4ySANi53-uyrAxxaZSAHUhWe8mYE-dc"
}
  ```
- **PASS — 5. create invite link (unscoped)**
  ```json
  {
  "status": 201,
  "url": "https://www.larry-pm.com/invite/link/nqVw0qYIO8RpVfeRlgs7ZMhr5eGs3bnWHzWaFxbVrUg"
}
  ```
- **PASS — 6. create project-scoped invite link**
  ```json
  {
  "status": 201,
  "url": "https://www.larry-pm.com/invite/link/a2XUL8Q6uajrLtLBQQxgJWgbaToKDyvLA2w51zomcm4"
}
  ```
- **PASS — 7. preview scoped invite link**
  ```json
  {
  "status": 200,
  "tenantName": "Launch Test Org",
  "projectName": "Invite Stress Test 2026-04-18",
  "usesRemaining": 2
}
  ```
- **PASS — 8. redeem invite link creates new user**
  ```json
  {
  "status": 200,
  "userId": "d7b7cfc7-32b9-4e9c-ad11-77ad16a2e68e",
  "tenantId": "5d7cd81b-03ed-4309-beba-b8e41ae21ac8",
  "email": "link-stress-87b2e8ac@mailinator.com"
}
  ```
- **PASS — 9. redeem second time (maxUses=2)**
  ```json
  {
  "status": 200
}
  ```
- **PASS — 10. third redeem is refused (exhausted)**
  ```json
  {
  "status": 410
}
  ```
- **PASS — 11a. revoke invite link**
  ```json
  {
  "status": 200
}
  ```
- **PASS — 11b. revoked link preview returns 410**
  ```json
  {
  "status": 410,
  "code": "invite_link_revoked"
}
  ```
- **PASS — 12. unknown link preview returns 404**
  ```json
  {
  "status": 404
}
  ```
