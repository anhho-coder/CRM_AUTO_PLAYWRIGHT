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
    }

    options {
        timeout(time: 60, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }

    stages {
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

        stage('Install Playwright browser (chromium)') {
            steps {
                // Only chromium is needed; the config uses the chromium-headless project.
                bat 'npx playwright install chromium'
            }
        }

        stage('Run Playwright test (headless)') {
            steps {
                // Pin chromium-headless. WITHOUT this, the default run also executes
                // the headed "chromium" project, which fails on a headless CI agent.
                bat 'npx playwright test "%SPEC%" --project=chromium-headless'
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
