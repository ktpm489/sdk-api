// const express = require("express");
// const router = express.Router();
// // const Item = require("../models/item");
// const oneSignal = require("../config/onesignal");

// router.post("/", async (req, res) => {
//   const item = new Item({
//     name: req.body.name,
//     image: req.body.image,
//     title: req.body.title,
//     description: req.body.description,
//     linkdetail: req.body.linkdetail,
//     level: req.body.level,
//     sdktype: req.body.sdktype,
//     companyid: req.body.companyid !== undefined ? req.body.companyid : "",
//   });

//   try {
//     const a1 = await item.save();
//     res.json(a1);
//   } catch (err) {
//     res.send("Error");
//   }
// });

// module.exports = router;
const grabity = require("grabity");
const validUrl = require("valid-url");
const UserModel = require("joone-models").User;
const ChannelModel = require("joone-models").Channel;
const PinnedMessagelModel = require("joone-models").PinnedMessage;
const ChatMessageModel = require("joone-models").ChatMessage;
const _ = require("lodash");
const ReportMessageModel = require("joone-models").ReportMessage;
const { decodeTokenFromAuth } = require("../utils/token");
const { postUser } = require("./User");
const md5 = require("md5");
const { base64encode, base64decode } = require("nodejs-base64");
const firebaseDB = require("../config/firebase");
const oneSignal = require("../config/onesignal");
const util = require("util");
const cheerio = require("cheerio");
const rp = require("request-promise");
const ogs = require("open-graph-scraper");
module.exports = {
  getLinkData: async (req) => {
    const link = req.query.link || "";
    try {
      if (link.indexOf("twitter.com") >= 0) {
        const tweet = await getTwitterStatusThumb(link);
        let res = {};
        if (tweet) {
          res["image"] = tweet.image;
          res["description"] = tweet.description || "";
          res["url"] = link;
          return res;
        }
        res["image"] = process.env.DEFAULT_OG_IMAGE;
        return res;
      }
      const options = { url: link };
      return ogs(options)
        .then((data) => {
          const { error, result } = data;
          if (error)
            return {
              siteName: "",
              title: "",
              description: "",
              image: process.env.DEFAULT_OG_IMAGE,
              logo: process.env.DEFAULT_OG_IMAGE,
              url: link,
            };
          const res = {
            siteName: result.ogSiteName,
            title: result.ogTitle,
            description: result.ogDescription,
            image: result.ogImage.url,
            logo: result.ogImage.url,
            url: result.requestUrl,
          };
          return res;
        })
        .catch(() => {
          return null;
        });
    } catch (error) {
      return null;
    }
  },
  postPinnedMessage: async (req) => {
    const verifiedJwt = decodeTokenFromAuth(req.headers.authorization);
    if (verifiedJwt._id !== req.params.id)
      return { statusCode: 400, message: "token.not.matched.user" };
    const channel = await ChannelModel.findById(req.payload.channelId, {
      community: 1,
      name: 1,
    });
    if (!channel) return { statusCode: 400, message: "channel.not.found" };
    const user = await UserModel.findOne({
      _id: req.params.id,
      communities: { $elemMatch: { isAdmin: true, id: channel.community } },
    });
    if (!user) return { statusCode: 400, message: "user.not.community.admin" };
    // Check existed pinned
    const existed = await PinnedMessagelModel.findOne({
      messageId: req.payload.messageId,
    });
    if (!existed) {
      const model = new PinnedMessagelModel({
        channelId: req.payload.channelId,
        messageId: req.payload.messageId,
      });
      return model.save();
    }
    return existed;
  },
  deletePinnedMessage: async (req) => {
    const verifiedJwt = decodeTokenFromAuth(req.headers.authorization);
    if (verifiedJwt._id !== req.params.id)
      return { statusCode: 400, message: "token.not.matched.user" };
    const channel = await ChannelModel.findById(req.params.channelId, {
      community: 1,
      name: 1,
    });
    if (!channel) return { statusCode: 400, message: "channel.not.found" };
    const user = await UserModel.findOne({
      _id: req.params.id,
      communities: { $elemMatch: { isAdmin: true, id: channel.community } },
    });
    if (!user) return { statusCode: 400, message: "user.not.community.admin" };
    return PinnedMessagelModel.remove({ messageId: req.params.messageId });
  },
  getPinnedMessage: async (req) => {
    const verifiedJwt = decodeTokenFromAuth(req.headers.authorization);
    const pageNum = req.query.pageNum || 1;
    const numPage = req.query.numPage || 100;
    const messageIdList = await PinnedMessagelModel.distinct("messageId", {
      channelId: req.params.channelId,
    });
    const res = await ChatMessageModel.find(
      { txtId: { $in: messageIdList }, deleteBy: { $nin: [verifiedJwt._id] } },
      null,
      { skip: (pageNum - 1) * numPage, limit: numPage, sort: { createdAt: -1 } }
    );
    return addMessageUserObject(res);
  },
  getGameItemRequestsByAddress: async (req) => {
    const address = req.query.from || req.query.to;
    if (!address) return { statusCode: 404, message: "address.not.found" };
    const user = await UserModel.findOne({ address }).select("_id");
    if (!user) return { statusCode: 404, message: "address.not.found" };
    let opts = { type: 5, isMonster: true, deleteBy: { $nin: [user._id] } };
    if (req.query.from) {
      opts["from"] = req.query.from.toLowerCase();
    }
    if (req.query.to) {
      opts["to"] = req.query.to.toLowerCase();
    }
    let optsPay = JSON.parse(JSON.stringify(opts));
    optsPay.type = 4;
    delete optsPay.isMonster;
    optsPay.isMonsterRequest = true;
    const requests = await ChatMessageModel.find(opts).sort({ createdAt: -1 });
    const pays = await ChatMessageModel.find(optsPay).sort({ createdAt: -1 });
    return { requests, pays };
  },
  postPayRequest: async (req) => {
    // console.log('postRequestFromNagemon', req.payload);
    const toUser = await UserModel.findOne(
      { address: req.payload.to },
      { _id: 1, image: 1, username: 1, address: 1, lang: 1, devices: 1 }
    );
    if (!toUser) return { statusCode: 400, message: "to.address.not.found" };
    let fromUser = await UserModel.findOne(
      { address: req.payload.from },
      { _id: 1, image: 1, username: 1, lang: 1, devices: 1, address: 1 }
    );
    if (!fromUser) {
      fromUser = await postUser({
        payload: {
          address: req.payload.from.toLowerCase(),
          password: md5(req.payload.from.toLowerCase()),
        },
      });
    }
    const message = {
      coinItem: {
        _id: fromUser._id,
        locked: false,
        image: req.payload.image || "",
        icon: req.payload.icon || "",
        name: req.payload.name || "",
        game: req.payload.game || "",
        id: req.payload.id || "",
        address: req.payload.address || "",
        symbol: req.payload.gameItem.symbol || "",
        businessAddress: req.payload.businessAddress || "",
        version: req.payload.version || null,
      },
      selectedCoin: {
        key: 0,
        name: req.payload.currencyName || "Ethereum",
        symbol: req.payload.currencySymbol || "ETH",
        price: 0, // not used
      },
      symbol: req.payload.gameItem.symbol,
      amount: req.payload.amount,
      isRequest: true,
      hash: req.payload.hash,
      fiatAmount: parseFloat(req.payload.fiatAmount),
      isMonster: req.payload.type == 5 ? true : false,
      isMonsterRequest: true,
    };
    const base64msg = base64encode(JSON.stringify(message));
    let data = {
      type: req.payload.type,
      from: req.payload.from,
      fromId: fromUser._id,
      to: toUser.address,
      toId: toUser._id,
      userImage: fromUser.image || "",
      userName: fromUser.username || "",
      message: base64msg,
      txHash: req.payload.hash,
      isBlock: false,
      isPrivate: true,
      isAdmin: false,
      image: "",
      linkPreview: "",
      txtId: req.payload.txtId,
      status: 1,
      isComplete: false,
      isMonster: true,
      isMonsterRequest: true,
      requestId: req.payload.requestId || null,
      buyOfferId: req.payload.buyOfferId || null,
    };
    const model = new ChatMessageModel(data);
    const msg = await model.save();
    // set to Firebase
    let firebaseData = {
      from: {
        id: fromUser._id.toString(),
        image: fromUser.image || "",
        name: fromUser.username || "",
        address: fromUser.address,
      },
      to: {
        id: toUser._id.toString(),
        image: toUser.image || "",
        name: toUser.username || "",
        address: toUser.address,
      },
      msgId: msg._id.toString(),
      newMsg: base64msg,
      // totalMsg: 1,
      type: req.payload.type,
      firebaseDbId: fromUser._id.toString() + toUser._id.toString(),
      isPrivate: true,
      time: new Date().getTime(),
      communityName: "",
      communityId: "",
    };
    let firebaseDataTo = JSON.parse(JSON.stringify(firebaseData));
    firebaseDataTo.firebaseDbId =
      toUser._id.toString() + fromUser._id.toString();
    firebaseDB.get(firebaseData.firebaseDbId, "newMsg", (result) => {
      let fbdata = result.val();
      if (fbdata) {
        firebaseData.totalMsg = parseInt(fbdata.totalMsg || 0) + 1;
        firebaseDB.set(firebaseData.firebaseDbId, "newMsg", firebaseData);
      }
    });
    firebaseDB.get(firebaseDataTo.firebaseDbId, "newMsg", (result) => {
      let fbdataTo = result.val();
      if (fbdataTo) {
        firebaseDataTo.totalMsg = parseInt(fbdataTo.totalMsg || 0) + 1;
        firebaseDB.set(firebaseDataTo.firebaseDbId, "newMsg", firebaseDataTo);
      }
    });
    // Create chat_list
    // check chat list in from/to User
    const chatList = {
      from: {
        id: fromUser._id,
        image: fromUser.image || "",
        name: fromUser.username || "",
        address: fromUser.address,
      },
      to: {
        id: toUser._id,
        image: toUser.image || "",
        name: toUser.username || "",
        address: toUser.address,
      },
      msgId: msg._id.toString(),
      type: req.payload.type,
      firebaseDbId: toUser._id.toString() + fromUser._id.toString(),
      isPrivate: true,
      time: new Date().getTime(),
      communityName: "",
      communityId: "",
    };
    UserModel.countDocuments({
      address: toUser.address,
      $or: [
        { "chat_list.from.address": req.payload.from },
        { "chat_list.to.address": req.payload.from },
      ],
    }).then((toUserChatList) => {
      if (!toUserChatList) {
        return UserModel.updateOne(
          { address: toUser.address },
          { $push: { chat_list: chatList } }
        );
      } else {
        // update chat list
        UserModel.updateOne(
          {
            address: toUser.address,
            chat_list: { $elemMatch: { "from.address": fromUser.address } },
          },
          { $set: { "chat_list.$": chatList } }
        ).exec();
        UserModel.updateOne(
          {
            address: toUser.address,
            chat_list: { $elemMatch: { "to.address": fromUser.address } },
          },
          { $set: { "chat_list.$": chatList } }
        ).exec();
      }
    });
    UserModel.countDocuments({
      address: req.payload.from,
      $or: [
        { "chat_list.from.address": req.payload.to },
        { "chat_list.to.address": req.payload.to },
      ],
    }).then((fromUserChatList) => {
      if (!fromUserChatList) {
        return UserModel.updateOne(
          { address: fromUser.address },
          { $push: { chat_list: chatList } }
        ).exec();
      } else {
        // udpate chat list
        UserModel.updateOne(
          {
            address: fromUser.address,
            chat_list: { $elemMatch: { "from.address": toUser.address } },
          },
          { $set: { "chat_list.$": chatList } }
        ).exec();
        UserModel.updateOne(
          {
            address: fromUser.address,
            chat_list: { $elemMatch: { "to.address": toUser.address } },
          },
          { $set: { "chat_list.$": chatList } }
        ).exec();
      }
    });

    if (req.payload.type == 4) {
      const firebasePayload = {
        txHash: req.payload.txHash,
        txtId: req.payload.txtId,
        type: req.payload.type,
        requestId: req.payload.requestId,
        from: req.payload.from.toLowerCase(),
        to: req.payload.to.toLowerCase(),
      };
      console.log("NAGEMONPAY", firebasePayload);
      firebaseDB.set(
        process.env.FIREBASE_TX,
        firebasePayload.txHash,
        firebasePayload
      );
    }
    // push notification to HB-app
    if (req.payload.type == 4) {
      // paid
      const languageTo = toUser.lang || "en";
      const languageFrom = fromUser.lang || "en";
      const langTo = require("../lang/" + languageTo + ".json");
      const langFrom = require("../lang/" + languageFrom + ".json");
      const oneSignalReceivedMessage = util.format(
        langTo.trnx.paid_nft,
        fromUser.username
      );
      const oneSignalPaidMessage = util.format(
        langFrom.trnx.receive_nft,
        toUser.username
      );
      const devicesReceived = [];
      const devicesPaid = [];
      toUser.devices.map((d) => {
        if (d) {
          if (d.oneSignalId !== "") devicesReceived.push(d.oneSignalId);
        }
      });
      fromUser.devices.map((d) => {
        if (d) {
          if (d.oneSignalId !== "") devicesPaid.push(d.oneSignalId);
        }
      });
      if (devicesReceived.length > 0) {
        oneSignal.sendNotification(devicesReceived, oneSignalReceivedMessage);
      }
      if (devicesPaid.length > 0) {
        oneSignal.sendNotification(devicesPaid, oneSignalPaidMessage);
      }
    } else if (req.payload.type == 5) {
      // push notification to HB-app
      const language = toUser.lang || "en";
      const lang = require("../lang/" + language + ".json");
      const oneSignalMessage = util.format(
        lang.trnx.request_nft,
        fromUser.username
      );
      const devices = [];
      toUser.devices.map((d) => {
        if (d) {
          if (d.oneSignalId !== "") devices.push(d.oneSignalId);
        }
      });
      if (devices.length > 0) {
        oneSignal.sendNotification(devices, oneSignalMessage);
      }
    }
    return msg;
  },
  putRequestByTxtId: async (req) => {
    console.log("putRequestByTxt", req.payload);
    return ChatMessageModel.updateOne(
      { txtId: req.payload.txtId },
      { $set: { status: 2, isComplete: true } }
    );
  },
  deleteRequestMonsterByAddressSymbolAndId: async (req) => {
    const requests = await ChatMessageModel.find(
      {
        isMonsterRequest: true,
        status: 1,
        type: 5,
        from: req.payload.from.toLowerCase(),
      },
      { _id: 1, message: 1 }
    );
    for (let request of requests) {
      const msg = base64decode(request.message);
      try {
        const msgObj = JSON.parse(msg);
        if (msgObj.coinItem) {
          if (
            msgObj.coinItem.symbol.toLowerCase() ==
              req.payload.symbol.toLowerCase() &&
            msgObj.coinItem.id == req.payload.id
          ) {
            ChatMessageModel.deleteOne({ _id: request._id }).exec();
          }
        }
      } catch (e) {
        console.log("deleteRequestMonsterBySymbolAndId error", e);
      }
    }
    return { statusCode: 200, message: "requests.deleted" };
  },
  updatePriceRequestByFrom: async (req) => {
    const requests = await ChatMessageModel.find(
      {
        isMonsterRequest: true,
        status: 1,
        from: req.payload.from.toLowerCase(),
      },
      { _id: 1, message: 1 }
    );
    for (let request of requests) {
      const msg = base64decode(request.message);
      try {
        const msgObj = JSON.parse(msg);
        if (msgObj.coinItem) {
          if (
            msgObj.coinItem.symbol.toLowerCase() ==
              req.payload.symbol.toLowerCase() &&
            msgObj.coinItem.id == req.payload.monsterId
          ) {
            msgObj.amount = req.payload.amount;
            msgObj.fiatAmount = req.payload.fiatAmount;
            const msgEncode = base64encode(JSON.stringify(msgObj));
            ChatMessageModel.updateOne(
              { _id: request._id },
              { message: msgEncode }
            ).exec();
          }
        }
      } catch (e) {
        console.log("deleteRequestMonsterBySymbolAndId error", e);
      }
    }
    return { statusCode: 200, message: "requests.updated" };
  },
  updateMessage: async (req) => {
    const verifiedJwt = decodeTokenFromAuth(req.headers.authorization);
    if (req.payload.type == "price") {
      const message = await ChatMessageModel.findOne(
        { txtId: req.payload.txtId },
        { _id: 1, message: 1 }
      );
      if (message) {
        const msg = base64decode(message.message);
        try {
          const msgObj = JSON.parse(msg);
          msgObj.amount = req.payload.amount;
          msgObj.fiatAmount = req.payload.fiatAmount;
          const msgEncode = base64encode(JSON.stringify(msgObj));
          return ChatMessageModel.findOneAndUpdate(
            { _id: message._id },
            { message: msgEncode, updatedAt: new Date() },
            { new: true }
          );
        } catch (e) {
          console.log("updateMessage error", e);
          return { statusCode: 400, message: "update.error" };
        }
      }
    } else {
      if (verifiedJwt.address.toLowerCase() != req.payload.from.toLowerCase())
        return { statusCode: 401, message: "cannot.be.updated" };
      return ChatMessageModel.findOneAndUpdate(
        { txtId: req.payload.txtId },
        { message: req.payload.message, updatedAt: new Date() },
        { new: true }
      );
    }
    return { statusCode: 400, message: "message.not.found" };
  },
  getCountRequestByAddress: async (req) => {
    const address = req.params.address.toLowerCase();
    const user = await UserModel.findOne({ address }).select("_id");
    if (!user) return { statusCode: 400, message: "address.not.found" };
    let opts = {
      to: address,
      type: 5,
      isRead: { $ne: true },
      isMonster: true,
      deleteBy: { $nin: [user._id] },
    };
    let countRequest = await ChatMessageModel.countDocuments(opts);
    return { countRequest };
  },
  putReadRequestByAddress: async (req) => {
    let res = await ChatMessageModel.updateMany(
      { to: req.params.address.toLowerCase(), isRead: { $ne: true } },
      { isRead: true }
    );
    if (res) {
      return { statusCode: 200, message: "requests.updated" };
    } else {
      return { statusCode: 403, message: "cannot.be.updated" };
    }
  },
  putTransaction: async (req) => {
    const address = req.payload.address;
    const hash = req.payload.hash;
    const msg = (delay = 1000, maxRepeat = 5, repeat = 0) => {
      return ChatMessageModel.findOne(
        { txtId: req.params.txtId },
        { receiver: 1, type: 1, toId: 1, from: 1, to: 1 }
      ).then((result) => {
        if (result) return result;
        if (repeat < maxRepeat) {
          // recall if api error
          return new Promise((resolve) => {
            setTimeout(() => {
              return resolve(msg(delay, maxRepeat, ++repeat));
            }, delay);
          });
        }
        return null;
      });
    };
    return msg().then(async (result) => {
      if (result) {
        const receivers = result.receiver || [];
        if (
          (result.type == 5 || result.type == 4) &&
          receivers.indexOf(address.toLowerCase()) < 0
        ) {
          return ChatMessageModel.updateOne(
            { txtId: req.params.txtId },
            {
              status: 2,
              isComplete: true,
              updatedAt: new Date(),
            }
          ).then(() => {
            const data = {
              type: result.type,
              txtId: req.params.txtId,
              txHash: hash,
              from: result.from,
              to: result.to,
            };
            const uri = process.env.JOONE_SOCCKET_URL + "/postTx";
            const body = {
              data,
              key: hash,
              type: process.env.FIREBASE_TX,
              event: "messages",
            };
            rp({ method: "POST", uri, body, json: true });
          });
        } else if (result.type == 6) {
          const txs = result.txs || [];
          if (receivers.indexOf(address.toLowerCase()) < 0) {
            receivers.push(address.toLowerCase());
            txs.push(hash);
          }
          const isComplete = receivers.length == result.numReceiver;
          const status = isComplete ? 2 : 1;
          ChatMessageModel.updateOne(
            {
              txtId: req.params.txtId,
              type: 6,
              status: 1,
              receiver: { $ne: address.toLowerCase() },
              txs: { $ne: hash },
            },
            {
              isComplete,
              status,
              txs,
              $push: { receiver: address.toLowerCase() },
            }
          ).exec();
          firebaseDB.set(process.env.FIREBASE_TX, hash, {
            gift: 1,
            txtId: req.params.txtId,
            txHash: hash,
          });
        }
      }
    });
  },
  postReport: async (req) => {
    const verifiedJwt = decodeTokenFromAuth(req.headers.authorization);
    const message = await ChatMessageModel.findOne(
      { txtId: req.payload.txtId },
      { _id: 1 }
    );
    if (message) {
      const data = {
        ...req.payload,
        ...{
          reporterAddress: verifiedJwt.address,
          deleted: false,
          messageId: message._id,
        },
      };
      const msg = new ReportMessageModel(data);
      return msg.save().then(() => {
        return ChatMessageModel.updateOne(
          { _id: message._id },
          { flag: true, reportedDate: new Date() }
        );
      });
    }
    return { statusCode: 400, message: "message.not.found" };
  },
  getReports: async (req) => {
    const limit = req.query.limit || 20;
    const page = req.query.page || 1;
    let data = await ChatMessageModel.find(
      { flag: true },
      { _id: 1, message: 1, from: 1, reportedDate: 1 }
    )
      .sort({ reportedDate: -1 })
      .limit(limit)
      .skip((page - 1) * limit)
      .lean();
    const total = await ChatMessageModel.countDocuments({ flag: true });
    // count report of messages
    const promises = [];
    for (let message of data) {
      promises.push(
        ReportMessageModel.countDocuments({
          messageId: message._id,
          deleted: false,
        })
      );
    }
    const counts = await Promise.all(promises);
    for (let i = 0; i < data.length; i++) {
      data[i].count = counts[i];
    }
    return {
      data,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      totalItems: total,
    };
  },
  getCountMessageReports: async () => {
    const data = await ChatMessageModel.countDocuments({ flag: true });
    return data;
  },
  getReportsOfMessage: async (req) => {
    const limit = req.query.limit || 20;
    const page = req.query.page || 1;
    const data = await ReportMessageModel.find({
      messageId: req.params.messageId,
    })
      .limit(limit)
      .skip((page - 1) * limit)
      .lean();
    const total = await ReportMessageModel.countDocuments({
      messageId: req.params.messageId,
    });
    return {
      data,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      totalItems: total,
    };
  },
  deleteReportedMessage: async (req) => {
    return ChatMessageModel.deleteOne({ _id: req.params.messageId }).then(
      () => {
        return ReportMessageModel.update(
          { messageId: req.params.messageId },
          { deleted: true },
          { multi: true }
        );
      }
    );
  },
  deleteReport: async (req) => {
    return ReportMessageModel.updateOne(
      { _id: req.params.id },
      { deleted: true }
    );
  },
};
async function addMessageUserObject(messageList = []) {
  // get user info
  let userIds = [];
  let usersData = [];
  if (messageList.length) {
    if (!messageList[0].isPrivate) {
      for (let message of messageList) {
        userIds.push(message.fromId);
      }
      userIds = _.uniq(userIds);
      usersData = await UserModel.find(
        { _id: { $in: userIds } },
        { address: 1, room: 1 }
      ).lean();
    }
  }
  const newList = [];
  for (let message of messageList) {
    message.user = {
      from: message.from || "",
      fromId: message.fromId || "",
      userName: message.userName || "",
      userImage: message.userImage || "",
    };
    // add field room into sender
    const sendFound = usersData.filter(
      (v) => v.address.toLowerCase() == message.from.toLowerCase()
    );
    message.user.room = false;
    if (sendFound.length) {
      message.user.room = sendFound[0].room || false;
    }
    newList.push(message);
  }
  return newList;
}
async function getTwitterStatusThumb(link) {
  // check link is mobile
  if (link.indexOf("mobile.twitter.com") < 0) {
    const pref = link.substr(0, link.indexOf("twitter.com"));
    const tw = link.substr(link.indexOf("twitter.com"));
    link = pref + "mobile." + tw;
  }
  const page = await rp(link);
  let $ = cheerio.load(page);
  const image = $(".main-tweet div.media img").attr("src");
  const fullName = $(".main-tweet .fullname strong").text();
  let tweetText = $(".main-tweet div.tweet-text div").text();
  let res = {
    description: "",
    image:
      "https://ipfs.io/ipfs/Qmdrr2Fna35kdatWZVZwE4nS31Xu9dZ9DoAas6GYjRjCvd?filename=default-thumbs.png",
  };
  if (tweetText && fullName) {
    tweetText = tweetText.trim();
    if (tweetText.includes("pic.twitter.com/"))
      tweetText = tweetText.substr(0, tweetText.indexOf("pic.twitter.com/"));
    res["description"] = fullName + " on Twitter " + tweetText.trim();
  }
  if (image) {
    res["image"] = image;
  }
  return res;
}