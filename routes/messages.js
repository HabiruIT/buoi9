var express = require('express')
var router = express.Router()
let mongoose = require('mongoose')
let MessageModel = require('../schemas/messages')
let { checkLogin } = require('../utils/authHandler.js.js')
let { uploadFile } = require('../utils/uploadHandler')

// GET /:userID - Lấy toàn bộ tin nhắn giữa user hiện tại và userID (2 chiều)
router.get('/:userID', checkLogin, async function (req, res, next) {
    try {
        let currentUserId = req.userId
        let otherUserId = req.params.userID

        let messages = await MessageModel.find({
            $or: [
                { from: currentUserId, to: otherUserId },
                { from: otherUserId, to: currentUserId }
            ]
        })
            .populate('from', 'username fullName avatarUrl')
            .populate('to', 'username fullName avatarUrl')
            .sort({ createdAt: 1 })

        res.send(messages)
    } catch (error) {
        next(error)
    }
})

// POST / - Gửi tin nhắn (text hoặc file)
router.post('/', checkLogin, uploadFile.single('file'), async function (req, res, next) {
    try {
        let currentUserId = req.userId
        let { to, text } = req.body

        if (!to) {
            return res.status(400).send({ message: 'Thiếu người nhận (to)' })
        }

        let messageContent
        if (req.file) {
            messageContent = { type: 'file', text: req.file.path }
        } else {
            if (!text) {
                return res.status(400).send({ message: 'Thiếu nội dung tin nhắn' })
            }
            messageContent = { type: 'text', text: text }
        }

        let newMessage = new MessageModel({
            from: currentUserId,
            to: to,
            messageContent: messageContent
        })

        await newMessage.save()
        await newMessage.populate('from', 'username fullName avatarUrl')
        await newMessage.populate('to', 'username fullName avatarUrl')

        res.status(201).send(newMessage)
    } catch (error) {
        next(error)
    }
})

// GET / - Lấy tin nhắn cuối cùng của mỗi cuộc trò chuyện mà user hiện tại tham gia
router.get('/', checkLogin, async function (req, res, next) {
    try {
        let currentUserId = new mongoose.Types.ObjectId(req.userId)

        let conversations = await MessageModel.aggregate([
            {
                $match: {
                    $or: [{ from: currentUserId }, { to: currentUserId }]
                }
            },
            { $sort: { createdAt: -1 } },
            {
                $addFields: {
                    otherUser: {
                        $cond: {
                            if: { $eq: ['$from', currentUserId] },
                            then: '$to',
                            else: '$from'
                        }
                    }
                }
            },
            {
                $group: {
                    _id: '$otherUser',
                    lastMessage: { $first: '$$ROOT' }
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'user'
                }
            },
            { $unwind: '$user' },
            {
                $project: {
                    _id: 0,
                    user: { _id: 1, username: 1, fullName: 1, avatarUrl: 1 },
                    lastMessage: 1
                }
            },
            { $sort: { 'lastMessage.createdAt': -1 } }
        ])

        res.send(conversations)
    } catch (error) {
        next(error)
    }
})

module.exports = router
