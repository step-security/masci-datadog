import * as core from '@actions/core'
import * as yaml from 'js-yaml'
import * as dd from './datadog'
import axios, {isAxiosError} from 'axios'
import fs from 'fs'

async function validateSubscription(): Promise<void> {
  const eventPath = process.env.GITHUB_EVENT_PATH
  let repoPrivate: boolean | undefined

  if (eventPath && fs.existsSync(eventPath)) {
    const eventData = JSON.parse(fs.readFileSync(eventPath, 'utf8'))
    repoPrivate = eventData?.repository?.private
  }

  const upstream = 'masci/datadog'
  const action = process.env.GITHUB_ACTION_REPOSITORY
  const docsUrl =
    'https://docs.stepsecurity.io/actions/stepsecurity-maintained-actions'

  core.info('')
  core.info('\u001b[1;36mStepSecurity Maintained Action\u001b[0m')
  core.info(`Secure drop-in replacement for ${upstream}`)
  if (repoPrivate === false)
    core.info('\u001b[32m✓ Free for public repositories\u001b[0m')
  core.info(`\u001b[36mLearn more:\u001b[0m ${docsUrl}`)
  core.info('')

  if (repoPrivate === false) return

  const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com'
  const body: Record<string, string> = {action: action || ''}
  if (serverUrl !== 'https://github.com') body.ghes_server = serverUrl
  try {
    await axios.post(
      `https://agent.api.stepsecurity.io/v1/github/${process.env.GITHUB_REPOSITORY}/actions/maintained-actions-subscription`,
      body,
      {timeout: 3000}
    )
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 403) {
      core.error(
        `\u001b[1;31mThis action requires a StepSecurity subscription for private repositories.\u001b[0m`
      )
      core.error(
        `\u001b[31mLearn how to enable a subscription: ${docsUrl}\u001b[0m`
      )
      process.exit(1)
    }
    core.info('Timeout or API not reachable. Continuing to next step.')
  }
}

export async function run(): Promise<void> {
  await validateSubscription()
  const apiKey: string = core.getInput('api-key', {required: true})
  const apiURL: string = core.getInput('api-url') || 'https://api.datadoghq.com'
  const ignoreTimeouts: boolean = core.getInput('ignore-timeouts') === 'true'
  const timeout: number = parseInt(core.getInput('timeout')) || 30000

  const metrics: dd.Metric[] =
    (yaml.load(core.getInput('metrics')) as dd.Metric[]) || []
  await dd.sendMetrics(apiURL, apiKey, metrics, ignoreTimeouts, timeout)

  const events: dd.Event[] =
    (yaml.load(core.getInput('events')) as dd.Event[]) || []
  await dd.sendEvents(apiURL, apiKey, events, ignoreTimeouts, timeout)

  const serviceChecks: dd.ServiceCheck[] =
    (yaml.load(core.getInput('service-checks')) as dd.ServiceCheck[]) || []
  await dd.sendServiceChecks(
    apiURL,
    apiKey,
    serviceChecks,
    ignoreTimeouts,
    timeout
  )

  const logApiURL: string =
    core.getInput('log-api-url') || 'https://http-intake.logs.datadoghq.com'
  const logs: dd.Log[] = (yaml.load(core.getInput('logs')) as dd.Log[]) || []
  await dd.sendLogs(logApiURL, apiKey, logs, ignoreTimeouts, timeout)
}
