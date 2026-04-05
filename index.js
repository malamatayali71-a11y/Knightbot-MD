/**
 * Knight Bot - A WhatsApp Bot
 * Copyright (c) 2024 Professor
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 * 
 * Credits:
 * - Baileys Library by @adiwajshing
 * - Pair Code implementation inspired by TechGod143 & DGXEON
 */
require('./settings')
const { Boom } = require('@hapi/boom')
const fs = require('fs')
const chalk = require('chalk')
const FileType = require('file-type')
const path = require('path')
const axios = require('axios')
const { handleMessages, handleGroupParticipantUpdate, handleStatus } = require('./main');
const PhoneNumber = require('awesome-phonenumber')
const { imageToWebp, videoToWebp, writeExifImg, writeExifVid } = require('./lib/exif')
const { smsg, isUrl, generateMessageTag, getBuffer, getSizeMedia, fetch, await, sleep, reSize } = require('./lib/myfunc')
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    generateForwardMessageContent,
    prepareWAMessageMedia,
    generateWAMessageFromContent,
    generateMessageID,
    downloadContentFromMessage,
    jidDecode,
    proto,
    jidNormalizedUser,
    makeCacheableSignalKeyStore,
    delay
} = require("@whiskeysockets/baileys")
const NodeCache = require("node-cache")
// Using a lightweight persisted store instead of makeInMemoryStore (compat across versions)
const pino = require("pino")
const readline = require("readline")
const { parsePhoneNumber } = require("libphonenumber-js")
const { PHONENUMBER_MCC } = require('@whiskeysockets/baileys/lib/Utils/generics')
const { rmSync, existsSync } = require('fs')
const { join } = require('path')

// Import lightweight store
const store = require('./lib/lightweight_store')

// Initialize store
store.readFromFile()
const settings = require('./settings')
setInterval(() => store.writeToFile(), settings.storeWriteInterval || 10000)

// Memory optimization - Force garbage collection if available
setInterval(() => {
    if (global.gc) {
        global.gc()
        console.log('🧹 Garbage collection completed')
    }
}, 60_000) // every 1 minute

// Memory monitoring - Restart if RAM gets too high
setInterval(() => {
    const used = process.memoryUsage().rss / 1024 / 1024
    if (used > 400) {
        console.log('⚠️ RAM too high (>400MB), restarting bot...')
        process.exit(1) // Panel will auto-restart
    }
}, 30_000) // check every 30 seconds

let phoneNumber = "911234567890"
let owner = JSON.parse(fs.readFileSync('./data/owner.json'))

global.botname = "H.A.C. System"
global.themeemoji = "•"
const pairingCode = !!phoneNumber || process.argv.includes("--pairing-code")
const useMobile = process.argv.includes("--mobile")

// Only create readline interface if we're in an interactive environment
const rl = process.stdin.isTTY ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null
const question = (text) => {
    if (rl) {
        return new Promise((resolve) => rl.question(text, resolve))
    } else {
        return Promise.resolve(settings.ownerNumber || phoneNumber)
    }
}


async function startXeonBotInc() {
    try {
        let { version, isLatest } = await fetchLatestBaileysVersion()
        const { state, saveCreds } = await useMultiFileAuthState(`./session`)
        const msgRetryCounterCache = new NodeCache()

        const XeonBotInc = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: !pairingCode,
            browser: ["Ubuntu", "Chrome", "20.0.04"],
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
            },
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: true,
            syncFullHistory: false,
            getMessage: async (key) => {
                let jid = jidNormalizedUser(key.remoteJid)
                let msg = await store.loadMessage(jid, key.id)
                return msg?.message || ""
            },
            msgRetryCounterCache,
            defaultQueryTimeoutMs: 60000,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
        })

        // Save credentials when they update
        XeonBotInc.ev.on('creds.update', saveCreds)

    store.bind(XeonBotInc.ev)

    // Message handling
    XeonBotInc.ev.on('messages.upsert', async chatUpdate => {
        try {
            const mek = chatUpdate.messages[0]
            if (!mek.message) return
            mek.message = (Object.keys(mek.message)[0] === 'ephemeralMessage') ? mek.message.ephemeralMessage.message : mek.message
            if (mek.key && mek.key.remoteJid === 'status@broadcast') {
                await handleStatus(XeonBotInc, chatUpdate);
                return;
            }
            if (!XeonBotInc.public && !mek.key.fromMe && chatUpdate.type === 'notify') {
                const isGroup = mek.key?.remoteJid?.endsWith('@g.us')
                if (!isGroup) return
            }
            if (mek.key.id.startsWith('BAE5') && mek.key.id.length === 16) return

            if (XeonBotInc?.msgRetryCounterCache) {
                XeonBotInc.msgRetryCounterCache.clear()
            }

            try {
                await handleMessages(XeonBotInc, chatUpdate, true)
            } catch (err) {
                console.error("Error in handleMessages:", err)
                if (mek.key && mek.key.remoteJid) {
                    await XeonBotInc.sendMessage(mek.key.remoteJid, {
                        text: '❌ An error occurred while processing your message.',
                    }).catch(console.error);
                }
            }
        } catch (err) {
            console.error("Error in messages.upsert:", err)
        }
    })

    // === H.A.C. SYSTEM (To Be Hero X) - Added here ===
    const DATA_FILE = './data/heroes.json';
    let heroes = {};
    let activeBattles = {};

    if (fs.existsSync(DATA_FILE)) {
      heroes = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }

    const RANK_THRESHOLDS = [
      { min: 0, rank: 'Civilian (Abilities Locked)' },
      { min: 10, rank: 'Aspiring Hero (Weak Ability)' },
      { min: 50, rank: 'Trusted Ally' },
      { min: 200, rank: 'Rising Hero' },
      { min: 500, rank: 'Elite Hero' },
      { min: 1000, rank: 'Top Contender' },
      { min: 5000, rank: 'HERO X' }
    ];

    function getRank(trust) {
      for (let i = RANK_THRESHOLDS.length - 1; i >= 0; i--) {
        if (trust >= RANK_THRESHOLDS[i].min) return RANK_THRESHOLDS[i].rank;
      }
      return RANK_THRESHOLDS[0].rank;
    }

    function saveHeroes() {
      fs.writeFileSync(DATA_FILE, JSON.stringify(heroes, null, 2));
    }

    // H.A.C. Command & RP Handler
    XeonBotInc.ev.on('messages.upsert', async (m) => {
      const msg = m.messages[0];
      if (!msg.message) return;

      const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
      const groupJid = msg.key.remoteJid;
      if (!groupJid || !groupJid.endsWith('@g.us')) return;

      const sender = msg.key.participant || msg.key.remoteJid;
      const isHAC = text.startsWith('!');
      const isRPAction = text.startsWith('/') && text.endsWith('/');

      if (!heroes[sender]) {
        heroes[sender] = { trust: 0, fear: 0, route: 'Civilian', ability: 'None', unlocked: false, quirk: '', missions: 0 };
      }

      if (isHAC) {
        const args = text.slice(1).trim().split(/\s+/);
        const cmd = args[0].toLowerCase();
        let reply = '';

        if (cmd === 'help') {
          reply = `🔵 *H.A.C. SYSTEM ONLINE*\n\nCommands:\n!register\n!profile @user\n!trust @user +50\n!chooseability @user "power with limiters"\n!battle @user1 @user2\n!raid\n!top10\n!challenge @user`;
        } else if (cmd === 'register') {
          heroes[sender].route = 'Aspiring Hero';
          reply = `🟢 *New Hero Registered*\nTrust: 0\nUse !chooseability "your power with limiters"`;
        } else if (cmd === 'profile' && args[1]) {
          const target = args[1].replace('@','') + '@s.whatsapp.net';
          const h = heroes[target] || { trust: 0, fear: 0, ability: 'None' };
          reply = `🔵 *Wrist Display*\nHero: ${args[1]}\nTrust: ${h.trust} | Rank: ${getRank(h.trust)}`;
        } else if (cmd === 'trust' && args[1]) {
          const target = args[1].replace('@','') + '@s.whatsapp.net';
          const amount = parseInt(args[2]) || 20;
          if (!heroes[target]) heroes[target] = { trust: 0, fear: 0, route: 'Civilian', ability: 'None', unlocked: false, quirk: '' };
          heroes[target].trust += amount;
          reply = `🟢 +${amount} Trust to ${args[1]}. Current: ${heroes[target].trust}`;
          saveHeroes();
        } else if (cmd === 'battle' && args[1]) {
          activeBattles[groupJid] = { players: [sender, args[1].replace('@','') + '@s.whatsapp.net'] };
          reply = `🌌 *Battle Started*\nUse /your action here/ only`;
        } else if (cmd === 'raid') {
          reply = `🌌 *System Raid Alert*\nThreat detected! Respond with /your action/`;
        }

        if (reply) {
          await XeonBotInc.sendMessage(groupJid, { text: reply });
        }
      } 
      else if (isRPAction && activeBattles[groupJid]) {
        const battle = activeBattles[groupJid];
        if (battle.players.includes(sender)) {
          const action = text.slice(1, -1).trim();
          await XeonBotInc.sendMessage(groupJid, { text: `🌌 *System:* ${sender.split('@')[0]} ${action}\n\nNext move?` });
        }
      }

      saveHeroes();
    });

    // Rest of original code (connection, pairing, etc.)
    XeonBotInc.decodeJid = (jid) => {
        if (!jid) return jid
        if (/:\d+@/gi.test(jid)) {
            let decode = jidDecode(jid) || {}
            return decode.user && decode.server && decode.user + '@' + decode.server || jid
        } else return jid
    }

    XeonBotInc.ev.on('contacts.update', update => {
        for (let contact of update) {
            let id = XeonBotInc.decodeJid(contact.id)
            if (store && store.contacts) store.contacts[id] = { id, name: contact.notify }
        }
    })

    XeonBotInc.getName = (jid, withoutContact = false) => {
        id = XeonBotInc.decodeJid(jid)
        withoutContact = XeonBotInc.withoutContact || withoutContact
        let v
        if (id.endsWith("@g.us")) return new Promise(async (resolve) => {
            v = store.contacts[id] || {}
            if (!(v.name || v.subject)) v = XeonBotInc.groupMetadata(id) || {}
            resolve(v.name || v.subject || PhoneNumber('+' + id.replace('@s.whatsapp.net', '')).getNumber('international'))
        })
        else v = id === '0@s.whatsapp.net' ? {
            id,
            name: 'WhatsApp'
        } : id === XeonBotInc.decodeJid(XeonBotInc.user.id) ?
            XeonBotInc.user :
            (store.contacts[id] || {})
        return (withoutContact ? '' : v.name) || v.subject || v.verifiedName || PhoneNumber('+' + jid.replace('@s.whatsapp.net', '')).getNumber('international')
    }

    XeonBotInc.public = true

    XeonBotInc.serializeM = (m) => smsg(XeonBotInc, m, store)

    // Handle pairing code
    if (pairingCode && !XeonBotInc.authState.creds.registered) {
        if (useMobile) throw new Error('Cannot use pairing code with mobile api')

        let phoneNumber
        if (!!global.phoneNumber) {
            phoneNumber = global.phoneNumber
        } else {
            phoneNumber = await question(chalk.bgBlack(chalk.greenBright(`Please type your WhatsApp number 😍\nFormat: 6281376552730 (without + or spaces) : `)))
        }

        phoneNumber = phoneNumber.replace(/[^0-9]/g, '')

        const pn = require('awesome-phonenumber');
        if (!pn('+' + phoneNumber).isValid()) {
            console.log(chalk.red('Invalid phone number. Please enter your full international number.'));
            process.exit(1);
        }

        setTimeout(async () => {
            try {
                let code = await XeonBotInc.requestPairingCode(phoneNumber)
                code = code?.match(/.{1,4}/g)?.join("-") || code
                console.log(chalk.black(chalk.bgGreen(`Your Pairing Code : `)), chalk.black(chalk.white(code)))
                console.log(chalk.yellow(`\nPlease enter this code in your WhatsApp app.`))
            } catch (error) {
                console.error('Error requesting pairing code:', error)
            }
        }, 3000)
    }

    // Connection handling
    XeonBotInc.ev.on('connection.update', async (s) => {
        const { connection, lastDisconnect, qr } = s
        
        if (qr) {
            console.log(chalk.yellow('📱 QR Code generated. Please scan with WhatsApp.'))
        }
        
        if (connection === 'connecting') {
            console.log(chalk.yellow('🔄 Connecting to WhatsApp...'))
        }
        
        if (connection == "open") {
            console.log(chalk.yellow(`🌿Connected to => ` + JSON.stringify(XeonBotInc.user, null, 2)))

            try {
                const botNumber = XeonBotInc.user.id.split(':')[0] + '@s.whatsapp.net';
                await XeonBotInc.sendMessage(botNumber, {
                    text: `🤖 H.A.C. System Connected Successfully!\n\nTo Be Hero X RP Bot is Online!`,
                }).catch(console.error);
            } catch (error) {
                console.error('Error sending connection message:', error.message)
            }

            await delay(1999)
            console.log(chalk.green(`\n\n                  ${chalk.bold.blue(`[ H.A.C. SYSTEM - To Be Hero X ]`)}\n\n`))
            console.log(chalk.green(`Bot is ready for your RP group!`))
        }
        
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut
            if (shouldReconnect) {
                console.log(chalk.yellow('Reconnecting...'))
                await delay(5000)
                startXeonBotInc()
            }
        }
    })

    return XeonBotInc
    } catch (error) {
        console.error('Error in startXeonBotInc:', error)
        await delay(5000)
        startXeonBotInc()
    }
}

// Start the bot
startXeonBotInc().catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
})

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err)
})

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err)
})

let file = require.resolve(__filename)
fs.watchFile(file, () => {
    fs.unwatchFile(file)
    console.log(chalk.redBright(`Update ${__filename}`))
    delete require.cache[file]
    require(file)
})
