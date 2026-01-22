# Auth System - Visual Flow & Architecture

## User Journey

```
┌─────────────────────────────────────────────────────────────────┐
│  Landing Page                                                   │
│  • 3D particle background (Three.js)                           │
│  • 3 rotating slides (Live Edit, Precision, Reactive Audio)   │
│  • "Get Started" button (top-right)                            │
└──────────────────────┬──────────────────────────────────────────┘
                       │ Click "Get Started"
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│  AuthForm Modal (OVERLAY)                                       │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  Create Account      [Sign In toggle]                     │ │
│  │                                                           │ │
│  │  EMAIL                                                   │ │
│  │  [your@email.com                                    ]    │ │
│  │                                                           │ │
│  │  PASSWORD                                                │ │
│  │  [••••••••                                          ]    │ │
│  │                                                           │ │
│  │  CONFIRM PASSWORD                                        │ │
│  │  [••••••••                                          ]    │ │
│  │                                                           │ │
│  │  [ CREATE ACCOUNT ] (bright green)                      │ │
│  │                                                           │ │
│  │  Already have an account? [Sign In]                     │ │
│  └───────────────────────────────────────────────────────────┘ │
│  • Dark background (#0a0a0a)                                   │
│  • Green glowing border (#00ff41)                              │
│  • Gradient blur effect behind modal                           │
│  • Backdrop blur on page                                       │
└──────────────────────┬──────────────────────────────────────────┘
                       │ Submit form
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│  Backend Processing                                             │
│  • Email validation (format check)                             │
│  • Email uniqueness check (database)                           │
│  • Password hash (PBKDF2, 100k iterations)                     │
│  • User record created                                          │
│  • Token generated                                              │
└──────────────────────┬──────────────────────────────────────────┘
                       │ Success response
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│  Main Editor                                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Header                                              USER: │  │
│  │ • Live Edit v2.5  [Chat] [Live AI] [Creative]  alice@...│  │
│  │                   ✓ RENDER_STATION_READY  [Logout]       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  • Chat Interface (video upload, analysis, editing)           │
│  • Audio library sidebar                                       │
│  • Video preview                                               │
│                                                                 │
│  [localStorage has: authToken + userEmail]                    │
└──────────────────────┬──────────────────────────────────────────┘
                       │ Click Logout
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│  Landing Page (again)                                           │
│  [localStorage cleared]                                         │
└─────────────────────────────────────────────────────────────────┘
```

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React/TypeScript)                  │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  App.tsx (Auth State Manager)                               │  │
│  │  • isAuthenticated: boolean                                  │  │
│  │  • userEmail: string                                         │  │
│  │  • handleAuthSuccess()                                       │  │
│  │  • handleLogout()                                            │  │
│  │  • localStorage persistence                                  │  │
│  └──────────────┬──────────────────────────────────────────────┘  │
│                 │                                                    │
│     ┌───────────┴──────────────┬──────────────┐                    │
│     ↓                          ↓              ↓                     │
│  ┌─────────────┐  ┌──────────────────┐  ┌──────────────┐           │
│  │ Landing     │  │ AuthForm         │  │ Main Editor  │           │
│  │ Page        │  │ • Email input    │  │ (Chat/Live/  │           │
│  │             │  │ • Password input │  │  Generate)   │           │
│  │ • 3D BG     │  │ • Sign up/Login  │  │              │           │
│  │ • Slides    │  │ • Validation     │  │ • Header     │           │
│  │ • Get Start │  │ • API calls      │  │ • Sidebar    │           │
│  │   button    │  │ • Error display  │  │ • Main area  │           │
│  └─────────────┘  │ • Loading state  │  │ • Footer     │           │
│                   └──────────────────┘  └──────────────┘           │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ HTTP/JSON
                            ↓
┌─────────────────────────────────────────────────────────────────────┐
│                         BACKEND (Flask/Python)                       │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  app.py (Authentication Layer)                               │  │
│  │                                                               │  │
│  │  ┌────────────────────────────────────────────────────────┐ │  │
│  │  │  Signup Endpoint: POST /api/auth/signup                │ │  │
│  │  │  • Validate email format                               │ │  │
│  │  │  • Check for duplicate email                           │ │  │
│  │  │  • Hash password (PBKDF2 + salt)                      │ │  │
│  │  │  • Insert user into database                           │ │  │
│  │  │  • Return token                                         │ │  │
│  │  └────────────────────────────────────────────────────────┘ │  │
│  │                                                               │  │
│  │  ┌────────────────────────────────────────────────────────┐ │  │
│  │  │  Login Endpoint: POST /api/auth/login                 │ │  │
│  │  │  • Look up user by email                              │ │  │
│  │  │  • Verify password hash (constant-time)               │ │  │
│  │  │  • Update last_login timestamp                         │ │  │
│  │  │  • Return token                                         │ │  │
│  │  └────────────────────────────────────────────────────────┘ │  │
│  │                                                               │  │
│  │  ┌────────────────────────────────────────────────────────┐ │  │
│  │  │  Logout Endpoint: POST /api/auth/logout               │ │  │
│  │  │  • Acknowledge logout request                          │ │  │
│  │  │  • (Token cleanup on client)                           │ │  │
│  │  └────────────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────────┘  │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ SQL
                            ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    DATABASE (Neon PostgreSQL)                        │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  users table                                                 │  │
│  │  ┌──────────┬─────────────┬──────────────────┬────────┐    │  │
│  │  │ id (PK)  │ email       │ password_hash    │ timestamps │  │
│  │  ├──────────┼─────────────┼──────────────────┼────────┤    │  │
│  │  │ 1        │ alice@...   │ salt$hashvalue   │ 2024-01... │  │
│  │  │ 2        │ bob@...     │ salt$hashvalue   │ 2024-01... │  │
│  │  │ ...      │ ...         │ ...              │ ...    │    │  │
│  │  └──────────┴─────────────┴──────────────────┴────────┘    │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Flow - Signup

```
User Input Form
       │
       ↓
AuthForm Component
  • Validate email format
  • Validate password length (≥6 chars)
  • Check passwords match
       │
       ↓
POST /api/auth/signup
  {
    "email": "alice@example.com",
    "password": "password123"
  }
       │
       ↓
Backend signup()
  • Email validation (regex)
  • Check if email exists → Query users table
  • Hash password:
    - Generate random salt
    - PBKDF2(password, salt, 100000 iterations)
    - Save as "salt$hash"
  • INSERT INTO users (email, password_hash)
       │
       ↓
Database Insert
  INSERT INTO users (email, password_hash, created_at)
  VALUES ('alice@example.com', 'abc123$def456...', NOW())
       │
       ↓
Response to Client
  {
    "success": true,
    "token": "random-token-string",
    "email": "alice@example.com"
  }
       │
       ↓
Frontend Handling
  • localStorage.setItem('authToken', token)
  • localStorage.setItem('userEmail', email)
  • setIsAuthenticated(true)
  • setUserEmail(email)
  • Close modal
       │
       ↓
Show Main Editor
  ✓ User logged in
  ✓ Header shows user email
  ✓ Logout button visible
```

## Data Flow - Login

```
User Input Form
       │
       ↓
AuthForm Component
  • Validate email format
  • Validate password not empty
       │
       ↓
POST /api/auth/login
  {
    "email": "alice@example.com",
    "password": "password123"
  }
       │
       ↓
Backend login()
  • SELECT password_hash FROM users WHERE email = ?
  • If not found → Return 401 "Invalid email or password"
  • If found:
    - Extract salt and hash from stored value
    - PBKDF2(input_password, stored_salt, 100000)
    - Compare hashes (constant-time compare)
    - If match → Update last_login, return token
    - If no match → Return 401
       │
       ↓
Response to Client
  {
    "success": true,
    "token": "random-token-string",
    "email": "alice@example.com"
  }
       │
       ↓
Frontend Handling
  • localStorage.setItem('authToken', token)
  • localStorage.setItem('userEmail', email)
  • setIsAuthenticated(true)
  • Close modal
       │
       ↓
Show Main Editor
  ✓ User logged in
```

## Security: Password Hashing

```
PBKDF2 Hash Generation (Signup):
┌──────────────────────────────────────┐
│ User enters: "MyPassword123"          │
└──────────────────────────────────────┘
             │
             ↓
┌──────────────────────────────────────────────────────────┐
│ secrets.token_hex(16) → Generate random 32-char salt    │
│ Example: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"             │
└──────────────────────────────────────────────────────────┘
             │
             ↓
┌──────────────────────────────────────────────────────────┐
│ hashlib.pbkdf2_hmac('sha256',                            │
│   password.encode(),                                     │
│   salt.encode(),                                         │
│   100000 iterations                                      │
│ )                                                        │
│                                                          │
│ → Produces 32-byte hash                                 │
│ Example: "7f8e9d0c1b2a3f4e5d6c7b8a9f0e1d2c"              │
└──────────────────────────────────────────────────────────┘
             │
             ↓
┌──────────────────────────────────────────────────────────┐
│ Store as: "salt$hash"                                    │
│ "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6$7f8e9d0c1b2a3f4e..." │
│                                                          │
│ In database: password_hash column                        │
└──────────────────────────────────────────────────────────┘

Password Verification (Login):
┌──────────────────────────────────────┐
│ User enters: "MyPassword123"          │
└──────────────────────────────────────┘
             │
             ↓
┌──────────────────────────────────────────────────────────┐
│ Retrieve hash from DB:                                   │
│ "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6$7f8e9d0c1b2a3f4e..." │
└──────────────────────────────────────────────────────────┘
             │
             ↓
┌──────────────────────────────────────────────────────────┐
│ Split by '$':                                            │
│ salt = "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"               │
│ stored_hash = "7f8e9d0c1b2a3f4e..."                     │
└──────────────────────────────────────────────────────────┘
             │
             ↓
┌──────────────────────────────────────────────────────────┐
│ Recompute hash using SAME salt:                          │
│ pbkdf2_hmac('sha256',                                    │
│   input_password.encode(),                              │
│   stored_salt.encode(),  ← Uses SAME salt               │
│   100000 iterations                                      │
│ )                                                        │
│ new_hash = "7f8e9d0c1b2a3f4e..."                        │
└──────────────────────────────────────────────────────────┘
             │
             ↓
┌──────────────────────────────────────────────────────────┐
│ Constant-time comparison:                                │
│ hmac.compare_digest(new_hash, stored_hash)              │
│                                                          │
│ Returns: True (match) or False (no match)                │
└──────────────────────────────────────────────────────────┘
```

## Error Handling

```
Signup Errors:
├─ 400: Missing email or password
├─ 400: Invalid email format
├─ 400: Password too short
├─ 409: Email already registered (conflict)
└─ 500: Server error

Login Errors:
├─ 400: Missing email or password
├─ 401: Invalid email or password (generic)
└─ 500: Server error

Client-side Error Display:
┌───────────────────────────┐
│ ERROR MESSAGE             │
│ Email already registered  │
├───────────────────────────┤
│ (red background, white    │
│  text, in form)           │
└───────────────────────────┘
```

## Styling Reference

```
AuthForm Modal Container:
├─ Position: fixed (overlay)
├─ Background: rgba(0,0,0,0.8) with backdrop blur
├─ Z-index: 50 (above everything)
└─ Responsive: p-4 on mobile, max-w-md on desktop

Modal Content:
├─ Background: #0a0a0a (very dark)
├─ Border: 1px solid #00ff41 (bright green)
├─ Shadow: 0 20px 80px rgba(0,255,65,0.2)
└─ Padding: 2rem (32px)

Inputs:
├─ Background: #1a1a1a
├─ Border: 1px solid #374151 (gray)
├─ Focus border: #00ff41 (green)
├─ Text: white
└─ Padding: 0.75rem 1rem

Button:
├─ Background: #00ff41 (bright green)
├─ Text: black
├─ Hover: #00e03a (darker green)
├─ Shadow: 0 10px 40px rgba(0,255,65,0.35)
├─ Font-weight: bold
├─ Text-transform: uppercase
└─ Letter-spacing: 0.25em

Labels:
├─ Font-size: 10px
├─ Text-transform: uppercase
├─ Color: #a3a3a3 (gray)
└─ Letter-spacing: 0.2em

Toggle Link (Sign In / Sign Up):
├─ Color: #00ff41 (green)
├─ Font-size: 10px
├─ Uppercase
└─ Bold
```

