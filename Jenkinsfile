pipeline {
    agent any

    tools {
        // Must match a NodeJS installation name in
        // Manage Jenkins > Tools > NodeJS installations
        nodejs 'NodeJS-20'
    }

    environment {
        // Enables Playwright CI behaviour from playwright.config.ts:
        //   retries: 2, forbidOnly: true
        CI = 'true'
        // The single spec we run first to prove the whole setup works.
        SPEC = 'tests/1.Project_CRM/1.SalesReport_Performance/tc-performance-1-1-1-1-create-lead.spec.ts'
        // Cache Playwright browsers OUTSIDE the workspace so they are downloaded
        // once and reused across builds (and survive `npm ci`). Add a Windows
        // Defender exclusion for this folder on the agent to avoid extraction stalls.
        PLAYWRIGHT_BROWSERS_PATH = 'C:\\pw-browsers'
    }

    options {
        timeout(time: 60, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '10'))
        // Do our own checkout in the 'Checkout' stage so we can enable
        // git core.longpaths FIRST. The repo has deeply-nested test paths that,
        // combined with the Jenkins workspace path, exceed the Windows MAX_PATH
        // (260) limit and break the default checkout with "Filename too long".
        skipDefaultCheckout(true)
    }

    stages {
        stage('Checkout (long-path safe)') {
            steps {
                // Let git create paths > 260 chars on Windows, then check out.
                bat 'git config --global core.longpaths true'
                checkout scm
            }
        }

        stage('Info') {
            steps {
                bat 'node --version'
                bat 'npm --version'
            }
        }

        stage('Connectivity check (VPN / pre-prod)') {
            // Informational: the CRM tests require the agent to reach the
            // internal pre-prod host. If this warns, the agent has no VPN
            // route and every test will time out at the login step.
            steps {
                powershell '''
                    try {
                        $r = Invoke-WebRequest -Uri 'http://pre-production.nakivo.site/' -UseBasicParsing -TimeoutSec 20 -MaximumRedirection 0 -ErrorAction Stop
                        Write-Host "OK - pre-prod reachable (HTTP $($r.StatusCode))"
                    } catch [System.Net.WebException] {
                        # A redirect (301) still proves reachability.
                        if ($_.Exception.Response) {
                            Write-Host "OK - pre-prod reachable (HTTP $([int]$_.Exception.Response.StatusCode))"
                        } else {
                            Write-Host "##### WARNING: pre-prod NOT reachable - check VPN/network on this agent #####"
                            Write-Host $_.Exception.Message
                        }
                    } catch {
                        Write-Host "##### WARNING: pre-prod NOT reachable - check VPN/network on this agent #####"
                        Write-Host $_.Exception.Message
                    }
                '''
            }
        }

        stage('Install dependencies') {
            steps {
                bat 'npm ci'
            }
        }

        stage('Verify Google Chrome present') {
            steps {
                // Google Chrome is already installed on this agent
                // (C:\Program Files\Google\Chrome). We do NOT run
                // `npx playwright install chrome` because Google's installer
                // spawns background processes that hold the console open and hang
                // the step. The chrome-headless project resolves Chrome from this
                // standard path via channel:'chrome'. Fail fast if it's missing.
                bat 'if exist "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" (echo Chrome present: OK) else (echo ERROR: Google Chrome not found on agent & exit /b 1)'
            }
        }

        stage('Run Playwright test (headless on Chrome)') {
            steps {
                // chrome-headless project = installed Google Chrome, headless, no download.
                bat 'npx playwright test "%SPEC%" --project=chrome-headless'
            }
        }
    }

    post {
        always {
            // The HTML report is written to a timestamped sub-folder
            // (playwright-report/<TS>_<folder>_[Worker-N]_<status>/index.html),
            // so match it with a wildcard rather than a fixed file name.
            publishHTML([
                allowMissing: true,
                alwaysLinkToLastBuild: true,
                keepAll: true,
                reportDir: 'playwright-report',
                reportFiles: '**/index.html',
                reportName: 'Playwright Report'
            ])
            junit testResults: 'playwright-report/**/junit-results.xml', allowEmptyResults: true
            archiveArtifacts artifacts: 'playwright-report/**, test-results/**', allowEmptyArchive: true
        }
        success {
            echo 'Tests passed!'
        }
        failure {
            echo 'Tests failed. Check the Playwright Report and archived test-results/ for screenshots, video and error-context.md.'
        }
    }
}
