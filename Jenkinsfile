pipeline {
    agent any

    tools {
        // Must match a NodeJS installation name in
        // Manage Jenkins > Tools > NodeJS installations
        nodejs 'NodeJS-20'
    }

    parameters {
        // Which spec to run. Override per-build via "Build with Parameters" in the
        // UI, or POST /job/.../buildWithParameters?SPEC=<repo-relative/path.spec.ts>.
        string(
            name: 'SPEC',
            defaultValue: 'tests/1.Project_CRM/O12_CE_to_O12_CC/UC-A-3-System-creates-a-lead-and-assigns-a-salesperson/BDEU_team/tc-a-3-1-BDEU-assign-salesperson-thomas-semerich-bdeu.spec.ts',
            description: 'Repo-relative path of the Playwright spec to run (use forward slashes).'
        )
    }

    environment {
        // Enables Playwright CI behaviour from playwright.config.ts:
        //   retries: 2, forbidOnly: true
        CI = 'true'
        // The spec to run is the SPEC build parameter (params.SPEC), see above.
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
                echo "Running spec: ${params.SPEC}"
                // Start each build with empty report/results dirs (the workspace
                // persists between builds) so the published report is ONLY this run.
                bat 'if exist playwright-report rmdir /s /q playwright-report'
                bat 'if exist test-results rmdir /s /q test-results'
                bat 'if exist pw-report rmdir /s /q pw-report'
                bat "npx playwright test \"${params.SPEC}\" --project=chrome-headless"
            }
        }
    }

    post {
        always {
            // Playwright writes the HTML report into a timestamped sub-folder
            // (playwright-report/<TS>_<folder>_[Worker-N]_<status>/). Flatten that
            // single run folder to a fixed 'pw-report' dir so the published
            // "Playwright Report" link opens THIS run's report directly, instead of
            // a chooser page listing folders.
            powershell '''
              if (Test-Path playwright-report) {
                $latest = Get-ChildItem playwright-report -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1
                if ($latest) {
                  if (Test-Path pw-report) { Remove-Item pw-report -Recurse -Force }
                  New-Item -ItemType Directory -Path pw-report | Out-Null
                  Copy-Item -Path (Join-Path $latest.FullName '*') -Destination pw-report -Recurse -Force
                  Write-Host "Published Playwright report from $($latest.Name)"
                } else { Write-Host 'No per-run report folder found to publish.' }
              } else { Write-Host 'No playwright-report directory found.' }
            '''
            publishHTML([
                allowMissing: true,
                alwaysLinkToLastBuild: true,
                keepAll: true,
                reportDir: 'pw-report',
                reportFiles: 'index.html',
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
