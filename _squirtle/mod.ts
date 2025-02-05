import yargs from 'https://deno.land/x/yargs@v17.6.0-deno/deno.ts';
import { decode } from "https://deno.land/std@0.161.0/encoding/base64.ts"
import { Select, Confirm } from "https://deno.land/x/cliffy@v0.25.4/prompt/mod.ts";
import { CHAR_LEFT_ANGLE_BRACKET } from 'https://deno.land/std@0.164.0/path/_constants.ts';

const runLogin = async () => {
  let env: any = await getEnv()
  let user

  const { AUTH_TOKEN, ENV } = env
  const isDev = ENV !== 'prod'
  const apiUrl = isDev ? 'https://api-dev.stellar.quest' : 'https://api.stellar.quest'

  if (AUTH_TOKEN)
    user = await getUser(env)

  else {
    const rulesConfirmed = await Select.prompt({
      message: "Do you agree to abide by our Official Rules?",
      options: [
        { name: "Yes", value: "yes" },
        { name: "Review", value: "open" },
        { name: "No", value: "no" },
      ],
    });

    if (rulesConfirmed === 'open') {
      const run0 = Deno.run({
        cmd: ['gp', 'preview', '--external', 'https://quest.stellar.org/rules/series-5']
      })
      await run0.status()
    }

    if (rulesConfirmed !== 'yes') 
      return

    const run1 = Deno.run({
      cmd: ['gp', 'url', '3000'],
      stdout: 'piped'
    })
    const gitpodUrl = new URL(new TextDecoder().decode(await run1.output()).trim())
    const discordUrl = new URL('https://discord.com/api/oauth2/authorize')
    discordUrl.searchParams.append('client_id', isDev ? '1024724391759724627' : '775714192161243161');
    discordUrl.searchParams.append('redirect_uri', `${apiUrl}/hooks/discord/code`);
    discordUrl.searchParams.append('response_type', 'code');
    discordUrl.searchParams.append('scope', 'identify email connections');
    discordUrl.searchParams.append('prompt', 'consent');
    discordUrl.searchParams.append('state', gitpodUrl.toString());

    const run2 = Deno.run({
      cmd: ['gp', 'preview', '--external', discordUrl.toString()]
    })
    await run2.status()

    // await until gp env includes AUTH_TOKEN (or timeout after 5 minutes??)
    await new Promise((resolve) => {
      const interval = setInterval(async () => {
        env = await getEnv()

        const { AUTH_TOKEN } = env

        if (AUTH_TOKEN) {
          clearInterval(interval)
          resolve(true)
          user = await getUser(env)
        }
      }, 5000)
    })
  }

  await runUser(null, user, env)
}

const runLogout = async (
  _: any, 
  internal = false
) => {
  const run1 = Deno.run({
    cmd: ['gp', 'env', '-u', 'AUTH_TOKEN'],
  })
  const run2 = Deno.run({
    cmd: ['gp', 'env', '-u', 'ACCESS_TOKEN'],
  })
  const run3 = Deno.run({
    cmd: ['gp', 'env', '-u', 'CLAIM_TOKEN'],
  })
  const run4 = Deno.run({
    cmd: ['gp', 'env', '-u', 'REFRESH_TOKEN'],
  })

  await Promise.all([
    run1.status(),
    run2.status(),
    run3.status(),
    run4.status(),
  ])

  if (!internal)
    console.log('👋 Bye bye');
}

const runUser = async (
  _: any, // throw away yargs
  user: any,
  env: any
) => {
  if (!env)
    env = await getEnv()

  const { AUTH_TOKEN, ENV } = env
  const isDev = ENV !== 'prod'
  const siteUrl = isDev ? 'https://quest-dev.stellar.org' : 'https://quest.stellar.org'

  if (!AUTH_TOKEN)
    return console.log(`Please run the <login> command first`);

  if (!user)
    user = await getUser(env)

  console.log(`-----------------------------`);
  console.log(`✅ Successfully authenticated ${user.discord.username}#${user.discord.discriminator}`);
  console.log(`-----------------------------`);

  let missing = false

  if (user.pk)
    console.log(`   ✅ Stellar wallet ${user.pk.substring(0, 6)}...${user.pk.substring(user.pk.length - 6)} is connected`);
  else {
    missing = true
    console.log(`   ❌ Please connect your Stellar wallet`);
  }

  if (user.kyc.status === 'approved')
    console.log(`   ✅ KYC flow has been completed`);
  else {
    missing = true
    console.log(`   ❌ Please complete the KYC flow`);
  }

  if (user.tax)
    console.log(`   ✅ Tax documents have been uploaded`);
  else {
    missing = true
    console.log(`   ❌ Please upload your tax documents`);
  }

  console.log(`-----------------------------`);

  if (missing) {
    const missingConfirmed = await Confirm.prompt(`Your account is not yet fully complete. 
   This could affect your ability to claim either NFT or XLM rewards.
   Would you like to complete your Stellar Quest account?`);

    if (!missingConfirmed)
      return

    const run1 = Deno.run({
      cmd: ['gp', 'preview', '--external', `${siteUrl}/settings`]
    })
    await run1.status()
  }
}

const runOpen = async () => {
  const env = await getEnv()

  const { ENV } = env
  const isDev = ENV !== 'prod'
  const siteUrl = isDev ? 'https://quest-dev.stellar.org' : 'https://quest.stellar.org'

  const run1 = Deno.run({
    cmd: ['gp', 'preview', '--external', siteUrl]
  })
  return run1.status()
}

const runPull = async () => {
  const run1 = Deno.run({
    cmd: ['git', 'stash',],
  })
  await run1.status()

  const run2 = Deno.run({
    cmd: ['git', 'fetch', '--all'],
  })
  await run2.status()

  const run3 = Deno.run({
    cmd: ['git', 'pull', '-X', 'theirs']
  })
  await run3.status()

  const run4 = Deno.run({
    cmd: ['git', 'stash', 'pop'],
  })
  await run4.status()
}

const runPlay = async (argv: any) => {
  if (!argv.index)
    throw '--index argument must be a positive integer'

  const index = argv.index - 1 // flag isn't zero indexed but the API is

  const env = await getEnv()
  const { checkToken } = await getCheckToken(index, env)

  const { pk, sk }: { pk: string, sk: string } = JSON.parse(
    new TextDecoder().decode(
      decode(
        checkToken.split('.')[1]
      )
    )
  )

  await Deno.writeFile("/workspace/.soroban-secret-key", new TextEncoder().encode(sk))

  console.log(`🔐 Quest Keypair for Stellar Quest Series 5 Quest ${argv.index}
✅ SOROBAN_SECRET_KEY environment variable has been updated
------------------------------------------
Public Key: ${pk} (don't forget to fund me)
Secret Key: ${sk}`)

  await autoFund(pk)
}

const autoFund = async (pk: string) => {
  const accountIsFunded = await isAccountFunded(pk)

  if (accountIsFunded)
    return

  console.log('------------------------------------------')

  const fundDecision = await Select.prompt({
    message: "🏧 Do you want to fund this account now?",
    options: [
      { name: "💁 Yes please!", value: "yes" },
      { name: "🙅 No thanks", value: "no" },
    ],
    default: "yes"
  })

  if (fundDecision == "yes")
    return doFund(pk)
}

const isAccountFunded = async (pk: string): Promise<boolean> => {
  return await fetch(`http://localhost:8000/accounts/${pk}`)
    .then(({status}) => status === 200)
}

const doFund = (pk: string) => {
  return fetch(`https://friendbot-futurenet.stellar.org/?addr=${pk}`)
    .then(handleResponse)
    .catch(printErrorBreak)
}

const runFund = async (argv: any) => {
  if (await isAccountFunded(argv.addr))
    return console.log('👀 Your account has already been funded.')

  return doFund(argv.addr)
}

const runCheck = async (argv: any) => {
  if (!argv.index)
    throw '--index argument must be a positive integer'

  const index = argv.index - 1 // flag isn't zero indexed but the API is

  const env = await getEnv()
  const user = await getUser(env)

  const { ENV } = env
  const isDev = ENV !== 'prod'
  const siteUrl = isDev ? 'https://quest-dev.stellar.org' : 'https://quest.stellar.org'
  
  if (!user.pk) {
    const missingPkConfirmed = await Confirm.prompt(`You have not yet connected your Stellar wallet. 
   This will affect your ability to claim NFT and XLM rewards.
   Would you like to connect your Stellar wallet?`);

    if (missingPkConfirmed) {
      const run1 = Deno.run({
        cmd: ['gp', 'preview', '--external', `${siteUrl}/settings`]
      })
      return run1.status()
    }
  }

  else if (
    !user.tax
    || user.kyc.status !== 'approved'
  ) {
    const missingPkConfirmed = await Confirm.prompt(`You have not yet completed the KYC flow and/or uploaded your tax documents.
   This will affect your ability to claim XLM rewards.
   Would you like to complete your Stellar Quest account?`);

    if (missingPkConfirmed) {
      const run2 = Deno.run({
        cmd: ['gp', 'preview', '--external', `${siteUrl}/settings`]
      })
      return run2.status()
    }
  }

  const { checkToken } = await getCheckToken(index, env)
  const claimToken = await getClaimToken(checkToken, env)

  if (!claimToken) // No claim token but also no error, you've already solved
    return console.log("🎉 Correct! 🧠");

  const run3 = Deno.run({
    cmd: ['gp', 'env', `CLAIM_TOKEN=${claimToken}`],
    stdout: 'null'
  })
  await run3.status()

  const { xdr, key, network, place, amount } = JSON.parse(
    new TextDecoder().decode(
      decode(
        claimToken.split('.')[1]
      )
    )
  )

  if (!xdr) // In the case of anon or pk'less accounts
    return console.log("🎉 Correct! 🧠");

  let message = "🎉 Correct!"

  if (parseInt(place) >= 0) {
    message += ` You took place ${place + 1}`

    if (amount)
      message += ` and won ${amount} XLM`

    message += ` ${place <= 2 ? '🏆' : '🏅'}${amount ? '💰' : ''}`
  }

  console.log(message);

  const signPrompt = await Select.prompt({
    message: 'How would you like to sign your reward transaction?',
    options: [
      { name: "Albedo", value: "albedo" },
      { name: "Raw XDR", value: "xdr" },
    ],
  });

  if (signPrompt === 'albedo') {
    const run4 = Deno.run({
      cmd: ['gp', 'url', '3000'],
      stdout: 'piped'
    })
    const gitpodUrl = new URL(new TextDecoder().decode(await run4.output()).trim())
    gitpodUrl.searchParams.append('xdr', xdr)
    gitpodUrl.searchParams.append('pubkey', key)
    gitpodUrl.searchParams.append('network', network.toLowerCase())

    const run5 = Deno.run({
      cmd: ['gp', 'preview', '--external', gitpodUrl.toString()]
    })
    return run5.status()
  }

  else if (signPrompt === 'xdr') {
    console.log(`-----------------------------`);
    console.log(`✅ Find the unsigned reward XDR below.`);
    console.log(`   You can sign it wherever you please (e.g. Laboratory)`);
    console.log(`   however you MUST submit that signed XDR back here with`);
    console.log(`   sq submit <signed_xdr>`);
    console.log(`-----------------------------`);
    console.log(xdr);
  }
}

const runSubmit = async (argv: any) => {
  const env = await getEnv()
  const { CLAIM_TOKEN } = env

  await submitClaimToken(CLAIM_TOKEN, argv.xdr, env)
    .then(() => {
      const { hash } = JSON.parse(
        new TextDecoder().decode(
          decode(
            CLAIM_TOKEN.split('.')[1]
          )
        )
      )

      console.log(`✅ Transaction ${hash} submitted!`)
    })
    .catch(async (err) => {
      const { claimToken } = err

      if (claimToken) {
        const run1 = Deno.run({
          cmd: ['gp', 'env', `CLAIM_TOKEN=${claimToken}`],
          stdout: 'null'
        })
        await run1.status()

        const { xdr } = JSON.parse(
          new TextDecoder().decode(
            decode(
              claimToken.split('.')[1]
            )
          )
        )

        console.log('❌ Transaction submission failed but a new XDR has been generated. Please sign it and try again');
        console.log(xdr);
      } else printErrorBreak(err)
    })
}

const runHelp = async () => {
  const run1 = Deno.run({
    cmd: ['sq', 'help'],
  })
  await run1.status()
}

const getEnv = async () => {
  const run1 = Deno.run({
    cmd: ['gp', 'env'],
    stdout: 'piped'
  })
  const gpEnvString = new TextDecoder().decode(await run1.output()).trim()

  const run2 = Deno.run({
    cmd: ['env'],
    stdout: 'piped'
  })
  const bashEnvString = new TextDecoder().decode(await run2.output()).trim()

  const env: any = {}

  gpEnvString
    .split('\n')
    .map((env) => env.split('='))
    .forEach(([key, value]) => env[key] = value)

  bashEnvString
    .split('\n')
    .map((env) => env.split('='))
    .forEach(([key, value]) => {
      if (['ENV'].includes(key)) // Only pick those VARS we actually want
        env[key] = value
    })

  return env
}

const getUser = (env: any) => {
  const { AUTH_TOKEN, ENV } = env
  const isDev = ENV !== 'prod'
  const apiUrl = isDev ? 'https://api-dev.stellar.quest' : 'https://api.stellar.quest'

  return fetch(`${apiUrl}/user`, { 
    headers: {
      'Authorization': `Bearer ${AUTH_TOKEN}`
    }
  })
    .then(handleResponse)
    .catch(async (err) => {
      await runLogout(null, true)
      printErrorBreak(err)
    })
}

const getCheckToken = (index: number, env: any) => {
  const { AUTH_TOKEN, ENV } = env
  const isDev = ENV !== 'prod'
  const apiUrl = isDev ? 'https://api-dev.stellar.quest' : 'https://api.stellar.quest'

  return fetch(`${apiUrl}/register/practice?series=5&index=${index}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${AUTH_TOKEN}`
    }
  })
    .then(handleResponse)
    .catch(printErrorBreak)
}

const getClaimToken = (checkToken: string, env: any) => {
  const { ENV } = env
  const isDev = ENV !== 'prod'
  const apiUrl = isDev ? 'https://api-dev.stellar.quest' : 'https://api.stellar.quest'

  return fetch(`${apiUrl}/answer/check`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${checkToken}`
    }
  })
    .then(handleResponse)
    .catch(printErrorBreak)
}

const submitClaimToken = (claimToken: string, innerTx: string, env: any) => {
  const { ENV } = env
  const isDev = ENV !== 'prod'
  const apiUrl = isDev ? 'https://api-dev.stellar.quest' : 'https://api.stellar.quest'

  return fetch(`${apiUrl}/prize/claim`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${claimToken}`
    },
    body: JSON.stringify({
      innerTx
    })
  })
    .then(handleResponse)
}

const handleResponse = async (response: any) => {
  const isResponseJson = response.headers.get('content-type')?.indexOf('json') > -1
  if (response.ok)
    return isResponseJson
      ? response.json()
      : response.text()

    throw isResponseJson
    ? {
      ...await response.json(),
      status: response.status
    }
    : await response.text()
}
const printErrorBreak = (error: any) => {
  if (typeof error === 'string')
    console.error(error)
  else
    console.error(JSON.stringify(error, null, 2))
  throw 0
}

yargs(Deno.args)
  .scriptName('sq')
  .command('login', 'Connect your Stellar Quest account to Gitpod', runLogin)
  .command('logout', 'Disconnect your Stellar Quest account from Gitpod', runLogout)
  .command(['user', 'me'], 'Print out information about yourself', {}, runUser)
  .command('open', 'Open the Stellar Quest website', runOpen)
  .command('pull', 'Pull any new or missing Quests into the /quests directory', runPull)
  .command(`play [index]`, 'Generate a Quest Keypair to play a Quest', (yargs: any) => yargs
    .positional('index', {
      describe: 'The index of the quest to play',
      alias: ['i', 'number', 'n', 'quest', 'q'],
    }).demandOption(['index']), runPlay)
  .command('fund [key]', 'Create and fund an account on the Futurenet', (yargs: any) => yargs
    .positional('key', {
      describe: 'The public key of the account to fund',
      alias: ['k', 'addr', 'address', 'acct', 'account']
    })
    .demandOption(['key']), runFund)
  .command('check [index]', 'Check your Quest answer', (yargs: any) => yargs
    .positional('index', {
      describe: 'The index of the quest to check',
      alias: ['i', 'number', 'n', 'quest', 'q'],
    }).demandOption(['index']), runCheck)
  .command('submit [xdr]', 'Submit a signed reward XDR to the Stellar Quest backend', (yargs: any) => yargs
    .positional('xdr', {
      describe: 'The XDR to submit to the Stellar Quest backend',
      alias: ['tx'],
    })
    .demandOption(['xdr']), runSubmit)
  .command('*', '', {}, runHelp)
  .showHelpOnFail(false)
  .demandCommand(1)
  .help('help')
  .alias('help', 'h')
  .strict()
  .parse()
