import * as core from '@actions/core'
import { readFileSync } from 'fs'
import { Octokit } from '@octokit/rest'
import parseDiff, { Chunk, File } from 'parse-diff'
import minimatch from 'minimatch'
import axios from 'axios'

axios.defaults.timeout = 300000

const GITHUB_TOKEN: string = core.getInput('GITHUB_TOKEN')
const SMART_CODER_API_URL: string = core.getInput('SMART_CODER_API_URL')
const SMART_CODER_API_KEY: string = core.getInput('SMART_CODER_API_KEY')

const octokit = new Octokit({ auth: GITHUB_TOKEN })

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  const data = JSON.parse(
    readFileSync(process.env.GITHUB_EVENT_PATH || '', 'utf8')
  )

  const pr = await getPullRequest(data.repository, data.number)

  core.debug(`event.action: ${data.action}`)

  let diff: string | null
  if (data.action === 'opened' || data.action === 'reopened') {
    diff = await getPullRequestDiff(pr.owner, pr.repo, pr.pull_number)
  } else if (data.action === 'synchronize') {
    const response = await octokit.repos.compareCommits({
      headers: {
        accept: 'application/vnd.github.v3.diff'
      },
      owner: pr.owner,
      repo: pr.repo,
      base: data.before,
      head: data.head
    })
    diff = String(response.data)
  } else {
    core.warning(`Unsupported event: ${data.action}`)
    return
  }

  if (!diff) {
    core.debug('No diff found')
    return
  }

  const parsed = parseDiff(diff)
  const excludePatterns = core
    .getInput('exclude')
    .split(',')
    .map(s => s.trim())

  const filtered = parsed.filter(file => {
    return !excludePatterns.some(pattern => minimatch(file.to ?? '', pattern))
  })

  const comments = await analyze(filtered, pr)
  if (comments.length > 0) {
    console.log('comments: ', comments)
    await submitReviewComment(pr.owner, pr.repo, pr.pull_number, comments)
  }
}

run().catch(error => {
  console.error('main error:', error)
  if (error instanceof Error) core.setFailed(error.message)
})

interface PullRequest {
  owner: string
  repo: string
  pull_number: number
  title: string
  description: string
}

async function getPullRequest(
  repository: any,
  number: number
): Promise<PullRequest> {
  const response = await octokit.pulls.get({
    owner: repository.owner.login,
    repo: repository.name,
    pull_number: number
  })
  return {
    owner: repository.owner.login,
    repo: repository.name,
    pull_number: number,
    title: response.data.title ?? '',
    description: response.data.body ?? ''
  }
}

async function getPullRequestDiff(
  owner: string,
  repo: string,
  pull_number: number
): Promise<any> {
  const response = await octokit.pulls.get({
    owner,
    repo,
    pull_number,
    mediaType: { format: 'diff' }
  })
  return response.data
}

async function analyze(
  files: File[],
  pr: PullRequest
): Promise<Array<{ body: string; path: string; line: number }>> {
  const comments: Array<{ body: string; path: string; line: number }> = []

  for (const file of files) {
    if (file.to === '/dev/null') continue // Ignore deleted files
    for (const chunk of file.chunks) {
      const diff = format(chunk)
      const response = await api.request(file, pr, diff)
      console.log('response:', response)
      // const aiResponse = await getAIResponse(prompt);
      if (response) {
        const newComments = createComment(file, response.reviews)
        if (newComments) {
          comments.push(...newComments)
        }
      }
    }
  }
  return comments
}

function format(chunk: Chunk): string {
  return `\`\`\`diff
  ${chunk.content}
  ${chunk.changes
    // @ts-expect-error - ln and ln2 exists where needed
    .map(c => `${c.ln ? c.ln : c.ln2} ${c.content}`)
    .join('\n')}
  \`\`\`
  `
}

function createComment(
  file: File,
  responses: Array<{
    lineNumber: string
    reviewComment: string
  }>
): Array<{ body: string; path: string; line: number }> {
  return responses.flatMap(v => {
    if (!file.to) {
      return []
    }
    return {
      body: v.reviewComment,
      path: file.to,
      line: Number(v.lineNumber)
    }
  })
}

async function submitReviewComment(
  owner: string,
  repo: string,
  pull_number: number,
  comments: Array<{ body: string; path: string; line: number }>
): Promise<void> {
  await octokit.pulls.createReview({
    owner,
    repo,
    pull_number,
    comments,
    event: 'COMMENT'
  })
}

function extractFuncionId() {
  const pettern = /FUNCTION\/(\d+)\/runs/
  const matchs = SMART_CODER_API_URL.match(pettern)
  if (!matchs) {
    return 0
  }
  return matchs[1]
}

const api = {
  request: async (file: File, pr: PullRequest, params: string) => {
    const functionId = extractFuncionId()
    if (!functionId) {
      console.error('Unsupported api')
      return
    }

    console.log('diff:\n', params)

    const read = async () => {
      return new Promise<{
        reviews: [{ lineNumber: string; reviewComment: string }]
      }>((resolve, reject) => {
        axios({
          method: 'post',
          url: SMART_CODER_API_URL,
          data: {
            functionId: functionId,
            stepNumber: 1,
            variables: [
              {
                key: 'diff',
                type: 'TEXT',
                value: params
              },
              {
                key: 'file',
                type: 'TEXT',
                value: file.to
              }
            ]
          },
          headers: {
            Accept: 'text/event-stream',
            Authorization: `Bearer ${SMART_CODER_API_KEY}`
          },
          responseType: 'stream'
        })
          .then(response => {
            const chunks: String[] = []
            const reader = response.data
            const decoder = new TextDecoder('utf-8')
            const pattern = /data:.*?"done":(true|false)}\n\n/
            let buffer = ''
            let bufferObj: any

            reader.on('readable', () => {
              let chunk
              while ((chunk = reader.read()) !== null) {
                buffer += decoder.decode(chunk, { stream: true })
                do {
                  // 循环匹配数据包(处理粘包)，不能匹配就退出解析循环去读取数据(处理数据包不完整)
                  const match = buffer.match(pattern)

                  if (!match) {
                    break
                  }

                  buffer = buffer.substring(match[0].length)
                  bufferObj = JSON.parse(match[0].replace('data:', ''))
                  const data = bufferObj.data

                  if (!data) throw new Error('Empty Message Events')
                  chunks.push(data.message)
                } while (true)
              }
            })

            reader.on('end', () => {
              let result: any = { reviews: [] }
              console.log('reader end:', chunks.join(''))
              if (chunks.length > 0) {
                try {
                  result = JSON.parse(chunks.join(''))
                } catch (error) {
                  console.error('end parse error:', error)
                }
              }
              resolve(result)
            })
          })
          .catch((reason: any) => {
            console.error('read error reason:', reason)
          })
      })
    }

    return await read()
  }
}
