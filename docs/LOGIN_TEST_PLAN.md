# NAKIVO Partner Portal - Login Function Test Plan

## Application Overview

The NAKIVO Partner Portal is an Odoo-based web application that provides access to partner resources for NAKIVO, a company that delivers all-in-one data protection and disaster recovery software solutions. The login functionality serves as the authentication gateway to the portal.

**Application URL:** https://sign-off.nakivo.site/web/login

### Key Features Identified:
- **Email/Password Authentication**: Standard login form with email and password fields
- **Error Handling**: Clear error messages for invalid credentials
- **Password Recovery**: "Forgot password?" link to reset password functionality
- **Session Management**: Automatic redirect to dashboard upon successful authentication
- **Client-Side Validation**: Form validation prevents submission with empty required fields
- **Branding**: NAKIVO logo and welcome message on login page

---

## Test Scenarios

### 1. Successful Login with Valid Credentials

**Seed:** `tests/seed.spec.ts`

**Objective:** Verify that users can successfully log in with valid credentials and access the portal.

**Steps:**
1. Navigate to https://sign-off.nakivo.site/web/login
2. Verify the login page loads with:
   - Email input field
   - Password input field
   - "Log in" button
   - "Forgot password?" link
   - NAKIVO logo and welcome message
3. Click in the "Email" input field
4. Enter valid email: `thanh.phan@nakivo.com`
5. Click in the "Password" input field
6. Enter valid password: `TPUaT@0123456789012`
7. Click the "Log in" button

**Expected Results:**
- Login form is submitted successfully
- User is redirected to the main portal page (https://sign-off.nakivo.site/web)
- Page title changes from "Login | NAKIVO Partner Portal" to "Odoo"
- User sees the main navigation menu with options: Discuss, Investments, Calendar, Contacts, CRM, Sales, etc.
- User profile button displays "Thanh Phan" in the top navigation bar
- No error messages are displayed

---

### 2. Login with Invalid Email Format

**Seed:** `tests/seed.spec.ts`

**Objective:** Verify that the system properly handles login attempts with invalid email formats.

**Steps:**
1. Navigate to https://sign-off.nakivo.site/web/login
2. Click in the "Email" input field
3. Enter invalid email format: `invalid-email` (without @ symbol)
4. Click in the "Password" input field
5. Enter any password: `password123`
6. Click the "Log in" button

**Expected Results:**
- Form is submitted to the server
- Page remains on the login page (URL stays at https://sign-off.nakivo.site/web/login)
- Error message appears: "Wrong login/password"
- Email field retains the entered value: `invalid-email`
- Password field is cleared
- User is not logged in

---

### 3. Login with Valid Email but Wrong Password

**Seed:** `tests/seed.spec.ts`

**Objective:** Verify that the system prevents login with incorrect password for a valid email.

**Steps:**
1. Navigate to https://sign-off.nakivo.site/web/login
2. Click in the "Email" input field
3. Enter valid email: `thanh.phan@nakivo.com`
4. Click in the "Password" input field
5. Enter incorrect password: `WrongPassword123`
6. Click the "Log in" button

**Expected Results:**
- Form is submitted to the server
- Page remains on the login page
- Error message appears: "Wrong login/password"
- Email field retains the entered value
- Password field is cleared
- User is not logged in
- No indication is given whether the email exists (security best practice)

---

### 4. Login with Empty Email Field

**Seed:** `tests/seed.spec.ts`

**Objective:** Verify that the system requires an email address before allowing login.

**Steps:**
1. Navigate to https://sign-off.nakivo.site/web/login
2. Leave the "Email" input field empty
3. Click in the "Password" input field
4. Enter any password: `password123`
5. Click the "Log in" button

**Expected Results:**
- Form is NOT submitted (client-side validation)
- Browser may show built-in validation message (e.g., "Please fill out this field")
- Page remains on the login page
- No server request is made
- Focus may be set to the Email field
- User is not logged in

---

### 5. Login with Empty Password Field

**Seed:** `tests/seed.spec.ts`

**Objective:** Verify that the system requires a password before allowing login.

**Steps:**
1. Navigate to https://sign-off.nakivo.site/web/login
2. Click in the "Email" input field
3. Enter valid email: `thanh.phan@nakivo.com`
4. Leave the "Password" input field empty
5. Click the "Log in" button

**Expected Results:**
- Form is NOT submitted (client-side validation)
- Browser may show built-in validation message on the password field
- Page remains on the login page
- No server request is made
- Focus may be set to the Password field
- Email field retains the entered value
- User is not logged in

---

### 6. Login with Both Fields Empty

**Seed:** `tests/seed.spec.ts`

**Objective:** Verify that the system prevents form submission when both required fields are empty.

**Steps:**
1. Navigate to https://sign-off.nakivo.site/web/login
2. Ensure both "Email" and "Password" fields are empty
3. Click the "Log in" button

**Expected Results:**
- Form is NOT submitted (client-side validation)
- Browser shows built-in validation message on the Email field
- Page remains on the login page
- No server request is made
- User is not logged in

---

### 7. Login with Non-Existent Email

**Seed:** `tests/seed.spec.ts`

**Objective:** Verify that the system properly handles login attempts with non-existent email addresses.

**Steps:**
1. Navigate to https://sign-off.nakivo.site/web/login
2. Click in the "Email" input field
3. Enter a valid email format that doesn't exist in the system: `nonexistent.user@nakivo.com`
4. Click in the "Password" input field
5. Enter any password: `password123`
6. Click the "Log in" button

**Expected Results:**
- Form is submitted to the server
- Page remains on the login page
- Error message appears: "Wrong login/password"
- Email field retains the entered value
- Password field is cleared
- User is not logged in
- System does not reveal whether the email exists (security best practice)

---

### 8. Login Using Enter Key on Email Field

**Seed:** `tests/seed.spec.ts`

**Objective:** Verify that users can submit the login form by pressing Enter after entering email.

**Steps:**
1. Navigate to https://sign-off.nakivo.site/web/login
2. Click in the "Email" input field
3. Enter valid email: `thanh.phan@nakivo.com`
4. Press the Tab key to move to the "Password" field
5. Enter valid password: `TPUaT@0123456789012`
6. Press the "Enter" key

**Expected Results:**
- Form is submitted (same behavior as clicking the "Log in" button)
- User is redirected to the main portal page
- Login is successful
- User sees the dashboard with navigation menu
- User profile displays "Thanh Phan"

---

### 9. Password Field Masking

**Seed:** `tests/seed.spec.ts`

**Objective:** Verify that the password field properly masks entered characters for security.

**Steps:**
1. Navigate to https://sign-off.nakivo.site/web/login
2. Click in the "Password" input field
3. Type the password: `TPUaT@0123456789012`
4. Observe the characters as they are typed
5. Inspect the password field properties using browser DevTools

**Expected Results:**
- All characters in the password field are masked (displayed as dots or asterisks)
- No plaintext password is visible on screen
- The HTML input element has `type="password"` attribute
- Password cannot be copied in plain text from the field
- Password is not visible in browser DevTools when inspecting the element value

---

### 10. Forgot Password Functionality

**Seed:** `tests/seed.spec.ts`

**Objective:** Verify that users can access the password reset functionality from the login page.

**Steps:**
1. Navigate to https://sign-off.nakivo.site/web/login
2. Locate the "Forgot password?" link below the "Log in" button
3. Click on the "Forgot password?" link

**Expected Results:**
- User is redirected to the password reset page
- URL changes to: https://sign-off.nakivo.site/web/reset_password
- Page title changes to: "Reset password | NAKIVO Partner Portal"
- Page displays:
  - "Your Email" input field
  - "Confirm" button
  - "Back to Login" link
- Same NAKIVO branding and welcome message are displayed
- User can enter email to reset password or navigate back to login

**Additional Verification:**
1. On the reset password page, click "Back to Login" link
2. Verify user is returned to the login page (https://sign-off.nakivo.site/web/login)

---

### 11. Session Persistence - Already Logged In User

**Seed:** `tests/seed.spec.ts`

**Objective:** Verify that already authenticated users are redirected appropriately when accessing the login page.

**Steps:**
1. Log in with valid credentials (email: `thanh.phan@nakivo.com`, password: `TPUaT@0123456789012`)
2. Verify successful login and presence on the main portal page
3. In the same browser session, navigate directly to: https://sign-off.nakivo.site/web/login

**Expected Results:**
- User is automatically redirected to the main portal page (https://sign-off.nakivo.site/web)
- Login page is not displayed since user already has an active session
- User remains logged in
- No login form is shown
- Dashboard and navigation menu are displayed

---

## Additional Test Considerations

### Security Tests (Future Enhancement)
- **SQL Injection**: Test with SQL injection patterns in email/password fields
- **XSS Attacks**: Test with JavaScript code in input fields
- **Brute Force Protection**: Test multiple failed login attempts to verify account lockout
- **CSRF Protection**: Verify CSRF token implementation
- **HTTPS Enforcement**: Verify that login page only works over HTTPS

### Performance Tests (Future Enhancement)
- **Login Response Time**: Measure time from clicking "Log in" to successful redirect
- **Concurrent Logins**: Test multiple users logging in simultaneously
- **Network Latency**: Test login behavior under slow network conditions

### Accessibility Tests (Future Enhancement)
- **Keyboard Navigation**: Verify full keyboard accessibility (Tab, Enter, etc.)
- **Screen Reader Compatibility**: Test with screen readers (NVDA, JAWS)
- **Color Contrast**: Verify WCAG compliance for error messages and text
- **Form Labels**: Verify proper ARIA labels and associations

### Browser Compatibility (Future Enhancement)
- Test on Chrome, Firefox, Safari, Edge
- Test on mobile browsers (iOS Safari, Chrome Mobile)
- Test on different screen sizes and resolutions

---

## Test Data

### Valid Credentials
- **Email:** thanh.phan@nakivo.com
- **Password:** TPUaT@0123456789012

### Invalid Test Data Examples
- **Invalid Email Formats:** `invalid-email`, `@nakivo.com`, `user@`, `user name@nakivo.com`
- **Non-Existent Emails:** `nonexistent.user@nakivo.com`, `test@test.com`
- **Invalid Passwords:** `wrong`, `12345`, `WrongPassword123`
- **Special Characters:** `<script>alert('xss')</script>`, `' OR '1'='1`

---

## Notes
- All test scenarios assume starting from a logged-out state unless otherwise specified
- The application uses Odoo framework, which may have specific security and validation behaviors
- Error messages do not distinguish between invalid email and wrong password (security best practice to prevent user enumeration)
- Client-side validation prevents empty field submission, but server-side validation should also be verified
- Session management testing requires browser cookie and local storage inspection
