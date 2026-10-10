// Declarative pipeline. Requires the Docker Pipeline, JUnit and HTML Publisher plugins.
pipeline {
  agent {
    docker {
      // Keep the image tag in sync with the @playwright/test version in package.json
      image 'mcr.microsoft.com/playwright:v1.63.0-noble'
      args '--ipc=host'
    }
  }

  parameters {
    choice(name: 'PROJECT', choices: ['all', 'chromium', 'firefox', 'webkit', 'mobile-chrome', 'mobile-safari', 'api', 'perf'], description: 'Playwright project to run')
    string(name: 'GREP', defaultValue: '', description: 'Tag filter, e.g. @smoke or @regression')
    string(name: 'BASE_URL', defaultValue: 'https://www.demoblaze.com', description: 'Application URL')
  }

  triggers {
    cron('H 1 * * *') // nightly regression
  }

  environment {
    CI = 'true'
    BASE_URL = "${params.BASE_URL}"
  }

  options {
    timeout(time: 45, unit: 'MINUTES')
    buildDiscarder(logRotator(numToKeepStr: '30'))
  }

  stages {
    stage('Install') {
      steps {
        sh 'npm ci'
        sh 'npx tsc --noEmit'
      }
    }
    stage('Test') {
      steps {
        script {
          def projectArg = params.PROJECT == 'all' ? '' : "--project=${params.PROJECT}"
          def grepArg = params.GREP?.trim() ? "--grep \"${params.GREP}\"" : ''
          sh "npx playwright test ${projectArg} ${grepArg}"
        }
      }
    }
  }

  post {
    always {
      junit allowEmptyResults: true, testResults: 'reports/junit/results.xml'
      publishHTML(target: [reportDir: 'reports/html', reportFiles: 'index.html', reportName: 'Playwright Report', keepAll: true, alwaysLinkToLastBuild: true, allowMissing: true])
      archiveArtifacts artifacts: 'reports/**', allowEmptyArchive: true
    }
  }
}
