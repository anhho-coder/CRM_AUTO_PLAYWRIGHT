pipeline {
    agent any

    tools {
        // Must match a NodeJS installation name in
        // Manage Jenkins > Tools > NodeJS installations
        nodejs 'NodeJS-20'
    }

    // A declarative pipeline REWRITES the job's parameters from this block on every
    // build, so params must be declared here (they can't live only in job config).
    // PROJECT = which section to run (a Playwright project from playwright.config.ts);
    // 'auto' picks the section by job name (see jobToProject map in the run stage).
    // SPEC = optional ad-hoc path/glob that overrides PROJECT.
    parameters {
        choice(
            name: 'PROJECT',
            choices: ['auto', 'Investments', 'Lead_Merging', 'Leads_Assignment', 'SalesReport_Performance', 'CRM_Module', 'O12'],
            description: 'Section to run. "auto" = pick by job name (e.g. CRM_Investments -> Investments).'
        )
        string(
            name: 'SPEC',
            defaultValue: '',
            description: 'Optional ad-hoc spec/folder/glob to run instead of the section (overrides PROJECT). Forward slashes.'
        )
        string(
            name: 'JIRA_PATH',
            defaultValue: '',
            description: 'Optional Jira/Xray Test Repository path, e.g. "CRM test/CRM module/CRM-10601 Veronikas request - Mass Mark lead as lost options" (or a deeper sub-folder, or just a CRM-#### key). Resolved to specs by ci/resolve-jira-path.js. Ignored when SPEC is set. Precedence: SPEC > JIRA_PATH > GREP > PROJECT.'
        )
        string(
            name: 'GREP',
            defaultValue: '',
            description: 'Optional Playwright --grep regex matched on test TITLES (the CRM-XXXX_X.X.X: prefix). Runs every matching test across all sections on chrome-headless. Combine several IDs with | to re-run an exact set. Ignored when SPEC or JIRA_PATH is set. Precedence: SPEC > JIRA_PATH > GREP > PROJECT.'
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
        // TEMPORARY DNS workaround: the agent can reach the pre-prod IP (10.220.222.100)
        // but its DNS cannot resolve pre-production.nakivo.site (ERR_NAME_NOT_RESOLVED).
        // Map the host at the Chrome level so tests run. REMOVE this line once agent DNS
        // is fixed (consumed by launchOptions.args in playwright.config.ts).
        HOST_RESOLVER_MAP = 'MAP pre-production.nakivo.site 10.220.222.100'
    }

    options {
        // Cap a single build at 90 min: a healthy section/sub-folder run finishes well
        // inside this, so exceeding it means the run is stuck or the env is flaky -
        // abort fast and free the executor instead of grinding for hours. Scope jobs to
        // sub-folders (SPEC/JIRA_PATH/GREP) to stay comfortably under the cap.
        timeout(time: 90, unit: 'MINUTES')
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
                script {
                    // SPEC (ad-hoc path) wins; else the section PROJECT; 'auto' maps the
                    // section from the job name. If nothing resolves -> fast smoke spec.
                    def jobToProject = [
                        'CRM_Investments'      : 'Investments',
                        'CRM_Lead_Merging'     : 'Lead_Merging',
                        'CRM_Leads_Assignment' : 'Leads_Assignment',
                        'CRM_SalesReport_Perf' : 'SalesReport_Performance',
                        'CRM_CRM_Module'       : 'CRM_Module',
                        'CRM_O12'              : 'O12',
                    ]
                    def spec = params.SPEC?.trim()
                    // JIRA_PATH (Jira/Xray Test Repository path) -> spec list via the resolver.
                    // SPEC still wins; JIRA_PATH beats PROJECT. The matched list is echoed to
                    // the build log so you can see exactly which specs will run.
                    def jiraPath = params.JIRA_PATH?.trim()
                    if (!spec && jiraPath) {
                        echo "Resolving JIRA_PATH via ci/resolve-jira-path.js: ${jiraPath}"
                        // Pass via env var + quoted %JP% so '&' and spaces in the path survive cmd.
                        def out = ''
                        withEnv(["JP=${jiraPath}"]) {
                            out = bat(returnStdout: true, script: '@echo off\r\nnode ci\\resolve-jira-path.js "%JP%"').trim()
                        }
                        echo out
                        def hit = (out =~ /(?m)^SPEC=(.+)$/)
                        def resolved = hit ? hit[0][1].trim() : ''
                        hit = null
                        if (!resolved) {
                            error "JIRA_PATH '${jiraPath}' resolved to no specs (see resolver output above)."
                        }
                        spec = resolved
                        echo "JIRA_PATH resolved -> SPEC: ${spec}"
                    }
                    // GREP (Playwright --grep on test titles) -> re-run an exact set of IDs.
                    // Used only when neither SPEC nor JIRA_PATH is set; beats PROJECT.
                    def grepPat = params.GREP?.trim()
                    def project = (params.PROJECT && params.PROJECT != 'auto') ? params.PROJECT : (jobToProject[env.JOB_BASE_NAME] ?: '')
                    // Start each build with empty report/results dirs (the workspace
                    // persists between builds) so the published report is ONLY this run.
                    bat 'if exist playwright-report rmdir /s /q playwright-report'
                    bat 'if exist test-results rmdir /s /q test-results'
                    bat 'if exist pw-report rmdir /s /q pw-report'
                    bat 'if exist allure-results rmdir /s /q allure-results'
                    if (spec) {
                        echo "Job '${env.JOB_BASE_NAME}' | ad-hoc SPEC: ${spec}"
                        bat "npx playwright test \"${spec}\" --project=chrome-headless"
                    } else if (grepPat) {
                        echo "Job '${env.JOB_BASE_NAME}' | GREP (title regex): ${grepPat}"
                        // Pass via env var + quoted %GP% so the regex's | and \\ survive cmd.
                        withEnv(["GP=${grepPat}"]) {
                            bat 'npx playwright test --grep "%GP%" --project=chrome-headless'
                        }
                    } else if (project) {
                        echo "Job '${env.JOB_BASE_NAME}' | section PROJECT: ${project}"
                        bat "npx playwright test --project=${project}"
                    } else {
                        echo "Job '${env.JOB_BASE_NAME}' | no PROJECT/SPEC set - running smoke spec"
                        bat 'npx playwright test "tests/1.Project_CRM/1.SalesReport_Performance/tc-performance-1-1-1-1-create-lead.spec.ts" --project=chrome-headless'
                    }
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
            // Stash THIS job's Allure raw results into a shared per-job folder so the
            // CRM_Allure_Report job can merge all sections into one combined report.
            powershell '''
              try {
                $dest = Join-Path 'C:\\allure\\results' $env:JOB_BASE_NAME
                if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Recurse -Force }
                New-Item -ItemType Directory -Path $dest -Force | Out-Null
                if (Test-Path allure-results) {
                  Get-ChildItem -LiteralPath allure-results -Force | ForEach-Object {
                    Copy-Item -LiteralPath $_.FullName -Destination $dest -Recurse -Force
                  }
                  Write-Host "Stashed Allure results -> $dest"
                } else { Write-Host 'No allure-results to stash.' }
              } catch {
                Write-Host "WARNING: could not stash Allure results: $($_.Exception.Message)"
              }
            '''
            // Also drop a DATE-stamped copy under C:\allure\periods\results\<yyyy-MM-dd>\<JOB>\
            // (separate tree, NOT scanned by the Total report). The per-period Allure jobs
            // (CRM-Allure-Daily/Monthly/Quarterly/Yearly) freeze a completed period from these,
            // so you can open "yesterday's / last month's" report the next day. Overwrites this
            // job's slice for today, so a day's bucket = that job's last run of the day.
            powershell '''
              try {
                $day  = (Get-Date).ToString('yyyy-MM-dd')
                $dest = "C:\\allure\\periods\\results\\$day\\$env:JOB_BASE_NAME"
                if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Recurse -Force }
                New-Item -ItemType Directory -Path $dest -Force | Out-Null
                if (Test-Path allure-results) {
                  Get-ChildItem -LiteralPath allure-results -Force | ForEach-Object {
                    Copy-Item -LiteralPath $_.FullName -Destination $dest -Recurse -Force
                  }
                  Write-Host "Stashed dated Allure results -> $dest"
                } else { Write-Host 'No allure-results to stash (dated bucket).' }
              } catch {
                Write-Host "WARNING: could not stash dated Allure results: $($_.Exception.Message)"
              }
            '''
        }
        success {
            echo 'Tests passed!'
        }
        failure {
            echo 'Tests failed. Check the Playwright Report and archived test-results/ for screenshots, video and error-context.md.'
        }
    }
}
