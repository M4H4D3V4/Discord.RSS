const config = require('../config.json')
const translator = require('../rss/translator/translate.js')
const storage = require('./storage.js')
const deletedFeeds = storage.deletedFeeds
const currentGuilds = storage.currentGuilds
const debugFeeds = require('../util/debugFeeds').list

module.exports = function (bot, article, callback, isTestMessage) {
  const channel = bot.channels.get(article.discordChannelId)
  const rssName = article.rssName
  const guildRss = currentGuilds.get(channel.guild.id)
  const rssList = guildRss.sources

  // Sometimes feeds get deleted mid-retrieval cycle, thus check for empty rssList and if the feed itself was deleted
  if (!rssList || rssList.size() === 0) return console.log(`RSS Warning: (${channel.guild.id}, ${channel.guild.name}) => No sources for guild, skipping Discord message sending.`)
  if (deletedFeeds.includes(rssName)) return console.log(`RSS Warning: (${channel.guild.id}, ${channel.guild.name}) => Feed (rssName ${rssName}, link: ${rssList[rssName].link}) was deleted during cycle, skipping Discord message sending.`)

  let attempts = 1

  // const successLog = (isTestMessage) ? `RSS Test Delivery: (${channel.guild.id}, ${channel.guild.name}) => Sent test message for: ${rssList[rssName].link} in channel (${channel.id}, ${channel.name})` : `RSS Delivery: (${channel.guild.id}, ${channel.guild.name}) => Sent message: ${article.link} in channel (${channel.id}, ${channel.name})`
  const failLog = (isTestMessage) ? `RSS Test Delivery Failure: (${channel.guild.id}, ${channel.guild.name}) => channel (${channel.id}, ${channel.name}) for article ${article.link}. ` : `RSS Delivery Failure: (${channel.guild.id}, ${channel.guild.name}) => channel (${channel.id}, ${channel.name}) for article ${article.link}. `
  const message = translator(guildRss, rssList, rssName, article, isTestMessage)

  if (!message) {
    if (config.logging.showUnfiltered === true) console.log(`RSS Delivery: (${channel.guild.id}, ${channel.guild.name}) => '${(article.link) ? article.link : article.title}' did not pass filters and was not sent.`)
    return callback()
  }

  function sendTestDetails () {
    channel.send(message.testDetails, {split: {prepend: '```md\n', append: '```'}})
    .then(m => sendMain())
    .catch(err => {
      if (attempts === 4) return callback(new Error(failLog + `${err}`))
      attempts++
      setTimeout(sendTestDetails, 500)
    })
  }

  function sendCombinedMsg () {
    channel.send(message.textMsg, {embed: message.embedMsg})
    .then(m => {
      // console.log(successLog)
      if (debugFeeds.includes(rssName)) console.log(`DEBUG ${rssName}: Message combo has been translated and has been sent (TITLE: ${article.title}).`)
      return callback()
    })
    .catch(err => {
      if (attempts === 4) {
        if (debugFeeds.includes(rssName)) console.log(`DEBUG ${rssName}: Message combo has been translated but could not be sent (TITLE: ${article.title}) (${err}).`)
        return callback(new Error(failLog + `${err}`))
      }
      attempts++
      setTimeout(sendCombinedMsg, 500)
    })
  }

  function sendTxtMsg () {
    channel.send(message.textMsg)
    .then(m => {
      // console.log(successLog)
      if (debugFeeds.includes(rssName)) console.log(`DEBUG ${rssName}: Message has been translated and has been sent (TITLE: ${article.title}).`)
      return callback()
    })
    .catch(err => {
      if (attempts === 4) {
        if (debugFeeds.includes(rssName)) console.log(`DEBUG ${rssName}: Message has been translated but could not be sent (TITLE: ${article.title}). (${err})`)
        return callback(new Error(failLog + `${err}`))
      }
      attempts++
      setTimeout(sendTxtMsg, 500)
    })
  }

  function sendMain () { // Main Message: If it contains both an embed and text, or only an embed.
    if (message.embedMsg) {
      if (message.textMsg.length > 1950) { // Discord has a character limit of 2000
        console.log(`RSS Warning: (${channel.guild.id}, ${channel.guild.name}) => Feed article could not be sent for *${rssName}* due to character count >1950. Message is:\n\n `, message.textMsg)
        message.textMsg = `Error: Feed Article could not be sent for *${article.link}* due to character count >1950. This issue has been logged for resolution.`
      }
      sendCombinedMsg()
    } else { // Main Message: If it only contains a text message
      if (message.textMsg.length > 1950) {
        console.log(`RSS Warning: (${channel.guild.id}, ${channel.guild.name}) => Feed article could not be sent for *${rssName}* due to character count >1950. Message is:\n\n`, message.textMsg)
        message.textMsg = `Error: Feed Article could not be sent for *${article.link}* due to character count >1950. This issue has been logged for resolution.`
      } else if (message.textMsg.length === 0) {
        message.textMsg = `Unable to send empty message for feed article *${article.link}*.`
      }
      sendTxtMsg()
    }
  }

  // For test messages only. It will send the test details first, then the Main Message (above).
  if (isTestMessage) sendTestDetails()
  else sendMain()
}
