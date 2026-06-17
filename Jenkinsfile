pipeline {
    agent any

    tools {
        // Must match a NodeJS installation name in
        // Manage Jenkins > Tools > NodeJS installations
        nodejs 'NodeJS-20'
    }

    // SPEC (which file/folder/glob to run) is defined PER JOB in the job's own config
    // ("This project is parameterized" -> String Parameter SPEC -> Default Value), so it
    // is visible and editable in Jenkins. We deliberately do NOT declare parameters{}
    // here: a declarative parameters{} block would overwrite every job's SPEC default
    // on each build. The run stage reads params.SPEC and falls back to a smoke spec.

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
        // Generous cap so whole-folder jobs (e.g. 4.Investments has 150+ specs, run
        // sequentially with workers:1) are not cut off. Single-spec jobs finish in
        // minutes regardless. Scope a job to a sub-folder to keep runs short.
        timeout(time: 480, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '10'))
        // One run per job at a time: clicking Build twice queues rather than running
        // two concurrent builds that fight for executors / spawn @2 workspaces.
        disableConcurrentBuilds()
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
                script {
                    // Target = the job's SPEC parameter (set in the job config: a file,
                    // folder, or glob). Falls back to a fast smoke spec if SPEC is empty.
                    def fallback = 'tests/1.Project_CRM/1.SalesReport_Performance/tc-performance-1-1-1-1-create-lead.spec.ts'
                    def target = params.SPEC?.trim() ? params.SPEC.trim() : fallback
                    echo "Job '${env.JOB_BASE_NAME}' | SPEC: '${params.SPEC}' | Running: ${target}"
                    // Start each build with empty report/results dirs (the workspace
                    // persists between builds) so the published report is ONLY this run.
                    bat 'if exist playwright-report rmdir /s /q playwright-report'
                    bat 'if exist test-results rmdir /s /q test-results'
                    bat 'if exist pw-report rmdir /s /q pw-report'
                    bat "npx playwright test \"${target}\" --project=chrome-headless"
                }
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
            // NB: the run folder name contains [Worker-N]; PowerShell treats [ ] as
            // wildcards, so use -LiteralPath everywhere. Wrapped in try/catch so a
            // report-publish hiccup can never fail an otherwise-passing build.
            powershell '''
              $ErrorActionPreference = 'Stop'
              try {
                if (Test-Path playwright-report) {
                  $latest = Get-ChildItem -LiteralPath playwright-report -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1
                  if ($latest) {
                    if (Test-Path pw-report) { Remove-Item -LiteralPath pw-report -Recurse -Force }
                    New-Item -ItemType Directory -Path pw-report | Out-Null
                    Get-ChildItem -LiteralPath $latest.FullName -Force | ForEach-Object {
                      Copy-Item -LiteralPath $_.FullName -Destination pw-report -Recurse -Force
                    }
                    Write-Host "Published Playwright report from $($latest.Name)"
                  } else { Write-Host 'No per-run report folder found to publish.' }
                } else { Write-Host 'No playwright-report directory found.' }
              } catch {
                Write-Host "WARNING: could not flatten Playwright report: $($_.Exception.Message)"
              }
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
