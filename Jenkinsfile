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
            choices: ['auto', 'Investments', 'Lead_Merging', 'Leads_Assignment', 'SalesReport_Performance', 'CRM_Module', 'O12', 'PreSales'],
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
        choice(
            name: 'ROUTE_GATE',
            choices: ['auto', 'failfast', 'retry', 'off'],
            description: 'Pre-prod VPN route pre-flight, run on the dedicated "probe" node. auto = retry when triggered by timer/upstream (unattended) else fail-fast; failfast = abort in ~30s if the pre-prod route is down; retry = re-probe up to ROUTE_GATE_MIN minutes then abort; off = skip. Nightly/weekend launchers should pass ROUTE_GATE=retry.'
        )
        string(
            name: 'ROUTE_GATE_MIN',
            defaultValue: '15',
            description: 'Retry budget in minutes when ROUTE_GATE=retry (or auto -> retry). Re-probes every 60s up to this many minutes, then aborts with "ABORTED: pre-prod VPN route down".'
        )
        string(
            name: 'TIMEOUT_MIN',
            defaultValue: '90',
            description: 'Build timeout in minutes. Default 90 suits a healthy section/sub-folder run. Raise ONLY for a dedicated slow-lane job (e.g. the THD/async-assignment specs, which reload-poll up to 43 min each for the late Sales-Team/Salesperson cron): the SlowLane job passes 480.'
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
        // Lead-Assignment DEFERRED RE-VERIFY: any lead-assignment spec appends its
        // {leadUrl, field, expected} to this JSONL manifest (helpers/deferred-verify.helper.ts,
        // fired from LeadPage.verifySalesTeamAssignment). Harmless no-op for every other spec.
        // The async Sales-Team/Salesperson cron often has not run by assert time (Received: "");
        // the CRM_Leads_Assignment_DeferredVerify job re-opens each URL ~1h later for the
        // authoritative verdict. Post-build stashes a dated copy to C:\deferred-verify\<day>\.
        DEFERRED_MANIFEST = 'deferred-verify/la.jsonl'
    }

    options {
        // Absolute build backstop (declarative options only accepts a literal here). The
        // MEANINGFUL cap is the param-driven timeout(TIMEOUT_MIN) wrapping the test-run step
        // below (default 90 - all existing jobs unchanged; the THD/async-assignment slow-lane
        // job passes 480). This 540 is only a "truly stuck" ceiling above the 480 slow-lane run.
        timeout(time: 540, unit: 'MINUTES')
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
        stage('Pre-prod route gate') {
            // Runs on the dedicated 'probe' node (1 executor, EXCLUSIVE) so the route
            // probe can never be starved by the 3 shared executors. Aborting here (instead
            // of launching the run) prevents a whole build of ERR_CONNECTION_* garbage when
            // the VPN route to pre-prod (10.220.222.100) is down. Modes (param ROUTE_GATE):
            //   failfast = probe once; abort in ~30s if the route is down
            //   retry    = re-probe every 60s up to ROUTE_GATE_MIN minutes, then abort
            //   auto     = retry when unattended (timer/upstream cause) else failfast
            //   off      = skip the gate
            agent { label 'probe' }
            steps {
                script {
                    def mode = (params.ROUTE_GATE ?: 'auto').trim()
                    if (mode == 'auto') {
                        def unattended = false
                        try {
                            unattended = currentBuild.getBuildCauses().any {
                                def c = (it._class ?: '')
                                c.contains('TimerTrigger') || c.contains('SCMTrigger') || c.contains('UpstreamCause')
                            }
                        } catch (ignored) { unattended = false }
                        mode = unattended ? 'retry' : 'failfast'
                    }
                    if (mode == 'off') {
                        echo 'ROUTE_GATE=off -> skipping the pre-prod route pre-flight.'
                    } else {
                        def budget = 0
                        if (mode == 'retry') {
                            def m = (params.ROUTE_GATE_MIN ?: '15').trim()
                            budget = m.isInteger() ? m.toInteger() : 15
                        }
                        echo "Pre-prod route gate: mode=${mode}, budget=${budget} min - probing 10.220.222.100 on node 'probe'..."
                        def routeUp = {
                            return bat(returnStatus: true,
                                script: 'ping -n 2 10.220.222.100 | findstr /C:"Reply from 10.220.222.100" >nul') == 0
                        }
                        def waited = 0
                        def up = routeUp()
                        while (!up && waited < budget) {
                            echo "  route DOWN (waited ${waited}/${budget} min) - vpn-watchdog may reconnect; re-probing in 60s..."
                            sleep(time: 60, unit: 'SECONDS')
                            waited++
                            up = routeUp()
                        }
                        if (!up) {
                            error("ABORTED: pre-prod VPN route down (mode=${mode}, waited ${waited} min). Test run NOT launched to avoid ERR_CONNECTION garbage - re-run when the route is back (see the CRM-Connectivity-Check job).")
                        }
                        echo "Pre-prod route UP (Reply from 10.220.222.100)" + (waited > 0 ? " after ${waited} min" : "") + " -> proceeding to build & test."
                    }
                }
            }
        }

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

        stage('Ensure ffmpeg present (for video recording)') {
            steps {
                // Video recording (video:'retain-on-failure' in playwright.config.ts) needs
                // Playwright's ffmpeg. `npx playwright install ffmpeg` downloads fine but this
                // agent's AV STALLS the zip extraction indefinitely (same failure as the big
                // browser zips), so we cannot install from the CDN. Instead we ship the
                // ~3.5 MB ffmpeg-win64.exe in the repo (ci/ffmpeg/ffmpeg-1011) and copy it into
                // the Playwright browsers cache (PLAYWRIGHT_BROWSERS_PATH = C:\pw-browsers) - a
                // plain file copy is unaffected by the extraction stall. Idempotent (copies only
                // when absent) and fails fast if ffmpeg still is not there, so tests never run
                // against a missing encoder. Bump the ffmpeg-#### revision here and in the repo
                // when Playwright is upgraded.
                bat '''@echo off
setlocal enabledelayedexpansion
set "FF=C:\\pw-browsers\\ffmpeg-1011"
rem Guard on Playwright's INSTALLATION_COMPLETE marker (written only after a
rem SUCCESSFUL extraction) so a half-extracted/partial ffmpeg from an aborted
rem `install` is repaired by a fresh copy rather than skipped.
if not exist "%FF%\\INSTALLATION_COMPLETE" (
  echo Placing ffmpeg from repo - CDN extraction stalls on this agent
  if not exist "%FF%" mkdir "%FF%"
  copy /Y "ci\\ffmpeg\\ffmpeg-1011\\*" "%FF%"
) else (
  echo ffmpeg already present - skipping copy
)
if not exist "%FF%\\ffmpeg-win64.exe" (echo ERROR: ffmpeg missing after copy & exit /b 1)
rem A freshly-copied .exe can be EBUSY on first spawn while AV scans it, which would
rem make EVERY test error at browserContext.newPage (video spawns ffmpeg per page).
rem Poll ffmpeg -version until it runs so the AV lock clears BEFORE tests start; fail
rem fast if it never becomes runnable (then a C:\\pw-browsers AV exclusion is needed).
set OK=0
for /L %%i in (1,1,15) do (
  if !OK!==0 (
    "%FF%\\ffmpeg-win64.exe" -version >nul 2>&1
    if !errorlevel!==0 (set OK=1& echo ffmpeg executable verified on attempt %%i) else (echo ffmpeg not runnable yet - attempt %%i - waiting for AV scan... & ping -n 4 127.0.0.1 >nul)
  )
)
if !OK!==0 (echo ERROR: ffmpeg present but not executable after retries - add a Windows Defender exclusion for C:\\pw-browsers on the agent & exit /b 1)
echo ffmpeg OK
'''
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
                        'CRM_O12_PreSales'     : 'PreSales',
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
                    // Fresh deferred-verify manifest per build (workspace persists between builds).
                    bat 'if exist deferred-verify rmdir /s /q deferred-verify'
                    // Param-driven timeout on the actual test run (default 90 min - all
                    // existing jobs unchanged). The THD/async-assignment slow-lane job passes
                    // TIMEOUT_MIN=480 so the up-to-43-min per-spec late-assignment poll across
                    // the THD_team folder is not guillotined. Scripted context here allows the
                    // Groovy expression that the declarative options{} block rejects.
                    def runTimeout = (params.TIMEOUT_MIN ?: '90').toInteger()
                    // Per-job MINIMUM timeout floor: a whole-folder section that runs serially
                    // (workers:1) can exceed the 90-min default. CRM_O12_PreSales runs all 16
                    // 7.Pre-sales specs in one build (~2.5h + CI-retry headroom), so floor it at
                    // 240 even on a plain Build. Other jobs unaffected (floor 0). A user can still
                    // raise it further via TIMEOUT_MIN (max wins); it just can't drop below 240 here.
                    def jobMinTimeout = [ 'CRM_O12_PreSales' : 240 ]
                    runTimeout = Math.max(runTimeout, (jobMinTimeout[env.JOB_BASE_NAME] ?: 0))
                    // Resolve this run's single Playwright invocation into a closure so it can
                    // run under the mid-run VPN watchdog below.
                    def runPlaywright
                    if (spec) {
                        echo "Job '${env.JOB_BASE_NAME}' | ad-hoc SPEC: ${spec} | timeout ${runTimeout}m"
                        runPlaywright = { bat "npx playwright test \"${spec}\" --project=chrome-headless" }
                    } else if (grepPat) {
                        echo "Job '${env.JOB_BASE_NAME}' | GREP (title regex): ${grepPat} | timeout ${runTimeout}m"
                        // Pass via env var + quoted %GP% so the regex's | and \\ survive cmd.
                        runPlaywright = { withEnv(["GP=${grepPat}"]) { bat 'npx playwright test --grep "%GP%" --project=chrome-headless' } }
                    } else if (project) {
                        echo "Job '${env.JOB_BASE_NAME}' | section PROJECT: ${project} | timeout ${runTimeout}m"
                        runPlaywright = { bat "npx playwright test --project=${project}" }
                    } else {
                        echo "Job '${env.JOB_BASE_NAME}' | no PROJECT/SPEC set - running smoke spec"
                        runPlaywright = { bat 'npx playwright test "tests/1.Project_CRM/1.SalesReport_Performance/tc-performance-1-1-1-1-create-lead.spec.ts" --project=chrome-headless' }
                    }
                    // --- Mid-run pre-prod VPN gate -------------------------------------------
                    // The background CRM-Connectivity-Check job raises
                    //   http://10.8.81.44:8080/userContent/vpn-down.flag  (HTTP 200)
                    // after 2 consecutive failed pre-prod pings, and clears it on recovery.
                    // A watchdog polls it alongside the run; if it goes up we abort so the
                    // not-yet-run specs are NEVER executed (hence never marked failed on
                    // ERR_CONNECTION). Build ends NOT_BUILT, distinct from a real FAILURE.
                    bat 'if exist .pw_done del /q .pw_done'
                    env.VPN_ABORT = 'false'
                    try {
                        timeout(time: runTimeout, unit: 'MINUTES') {
                            parallel(
                                'playwright': {
                                    try { runPlaywright() } finally { bat 'echo done> .pw_done' }
                                },
                                'vpn-watchdog': {
                                    while (!fileExists('.pw_done')) {
                                        sleep(time: 60, unit: 'SECONDS')
                                        if (fileExists('.pw_done')) { break }
                                        // curl -f: exit 0 iff the flag exists (HTTP 200); non-zero on 404.
                                        if (bat(returnStatus: true, script: 'curl -s -f -o NUL "http://10.8.81.44:8080/userContent/vpn-down.flag"') == 0) {
                                            env.VPN_ABORT = 'true'
                                            echo 'VPN-WATCHDOG: pre-prod VPN flag RAISED mid-run - aborting; remaining specs will NOT run (not failed).'
                                            error('pre-prod VPN dropped mid-run')
                                        }
                                    }
                                },
                                failFast: true
                            )
                        }
                    } catch (err) {
                        def flagUp = (bat(returnStatus: true, script: 'curl -s -f -o NUL "http://10.8.81.44:8080/userContent/vpn-down.flag"') == 0)
                        if (env.VPN_ABORT == 'true' || flagUp) {
                            currentBuild.result = 'NOT_BUILT'
                            echo 'Run stopped: pre-prod VPN dropped mid-run. Remaining test cases were NOT executed (not failed). Re-run once the VPN route is back.'
                        } else {
                            throw err
                        }
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
            archiveArtifacts artifacts: 'playwright-report/**, test-results/**, deferred-verify/**', allowEmptyArchive: true
            // Lead-Assignment DEFERRED RE-VERIFY: stash this build's manifest into a DATED,
            // BUILD-keyed bucket so ALL round-1 builds of the day (CRM_Leads_Assignment,
            // CRM_O12 chunks, THD SlowLane, ...) UNION into one cluster that the
            // CRM_Leads_Assignment_DeferredVerify job re-verifies in a single last round.
            // Build-keyed filename => chunked/parallel runs never overwrite each other.
            powershell '''
              try {
                if (Test-Path deferred-verify/la.jsonl) {
                  $day  = (Get-Date).ToString('yyyy-MM-dd')
                  $dir  = "C:\\deferred-verify\\$day"
                  New-Item -ItemType Directory -Path $dir -Force | Out-Null
                  $dest = Join-Path $dir "$($env:JOB_BASE_NAME)-$($env:BUILD_NUMBER).jsonl"
                  Copy-Item -LiteralPath deferred-verify/la.jsonl -Destination $dest -Force
                  Write-Host "Stashed deferred-verify manifest -> $dest"
                } else { Write-Host 'No deferred-verify manifest this build (no lead-assignment specs ran).' }
              } catch {
                Write-Host "WARNING: could not stash deferred-verify manifest: $($_.Exception.Message)"
              }
            '''
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
            // Also drop a DATE-stamped copy under C:\allure\periods\results\<yyyy-MM-dd>\<JOB>\<BUILD>\
            // (separate tree, NOT scanned by the Total report). The per-period Allure jobs
            // (CRM-Allure-Daily/Weekly/Monthly/Quarterly/Yearly) freeze a completed period from these.
            // Keyed by BUILD_NUMBER so a chunked section (O12 runs as many SPEC builds, each a
            // disjoint slice) does NOT overwrite its own earlier slices — every build survives and
            // the period report UNIONS them into the full suite (latest-per-test).
            powershell '''
              try {
                $day  = (Get-Date).ToString('yyyy-MM-dd')
                $dest = "C:\\allure\\periods\\results\\$day\\$env:JOB_BASE_NAME\\$env:BUILD_NUMBER"
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
