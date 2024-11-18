const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
// const mg = require('nodemailer-mailgun-transport');
require('dotenv').config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// From MAilgun: 
const formData = require('form-data');
const Mailgun = require('mailgun.js');
const mailgun = new Mailgun(formData);
const mg = mailgun.client({ username: 'api', key: process.env.MAILGUN_API_KEY || '05679b17ae0d375a57ae5b485236ec5a-72e4a3d5-7c18af7d' });



const port = process.env.PORT || 5000;

const app = express();

// middleware
app.use(cors());
app.use(express.json());

// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@harunurrashid.qzeok.mongodb.net/?retryWrites=true&w=majority&appName=harunurRashid`;
const client = new MongoClient(process.env.MONGODB_URI || uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverApi: ServerApiVersion.v1
});


// Main Code Mailgun: 
function sendBookingEmail(paidBookingResult) {
    const { email, treatment, appointmentDate, slot } = paidBookingResult;
    console.log("paidBookingResult sendBookingEmail from function", paidBookingResult);



    // using nodeMailer and ethereal for sending mail: 
    // const transporter = nodemailer.createTransport({
    //     host: 'smtp.ethereal.email',
    //     port: 587,
    //     auth: {
    //         user: 'gerson.eichmann@ethereal.email',
    //         pass: 'b56JH4uQGaZcBsxcd7'
    //     }
    // });

    // // async..await is not allowed in global scope, must use a wrapper
    // async function main() {
    //     // send mail with defined transport object
    //     const info = await transporter.sendMail({
    //         from: '"Maddison Foo Koch 👻" <maddison53@ethereal.email>', // sender address
    //         to: "harunur15-13726@diu.edu.bd", // list of receivers
    //         subject: "Appointment confirmation...!", // Subject line
    //         text: "Hi There...", // plain text body
    //         html: `
    //                     <h3>Your appointment is confirmed at ${slot}</h3>
    //                     <div>
    //                         <p>Your appointment for treatment: ${treatment}</p>
    //                         <p>Please visit us on ${appointmentDate} at ${slot}</p>
    //                         <p>Thanks from docApp...!</p>
    //                     </div>
    //                     `
    //     });

    //     console.log("Message sent: %s", info.messageId);
    //     // Message sent: <d786aa62-4e0a-070a-47ed-0b0666549519@ethereal.email>
    // }
    // main().catch(console.error);


    console.log("Console before");
    // using mailGun for sending mail:
    mg.messages.create('sandbox-123.mailgun.org', {
        from: "Excited User <mailgun@sandbox178c7ee8801c4251a448e706e9e7c9c6.mailgun.org>",
        to: ["test@example.com"],
        subject: "Hello",
        text: "Testing some Mailgun awesomeness!",
        html: "<h1>Testing some Mailgun awesomeness!</h1>"
    })
        .then(msg => console.log("msg for sending", msg)) // logs response data
        .catch(err => console.log("msg for sending err", err)); // logs any error

    console.log("Console after");
}


// verifyJWT: 
function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).send('unauthorized access');
    }
    const token = authHeader.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'forbidden access' })
        }
        req.decoded = decoded;
        next();
    })
}

async function run() {
    try {
        const appointmentOptionCollection = client.db('docApp').collection('appointmentOptions');
        const bookingsCollection = client.db('docApp').collection('bookings');
        const usersCollection = client.db('docApp').collection('users');
        const doctorsCollection = client.db('docApp').collection('doctors');
        const paymentsCollection = client.db('docApp').collection('payments');
        const postCollection = client.db("docApp").collection("posts")

        const ConversationCollection = client.db('docApp').collection("conversations");
        const ConversationMessageCollection = client.db('docApp').collection("conversation-messages");

        console.log("MongoDB connected!");

        // NOTE: make sure you use verifyAdmin after verifyJWT
        const verifyAdmin = async (req, res, next) => {
            const decodedEmail = req.decoded.email;
            console.log("decodedEmail verifyAdmin", decodedEmail);

            const query = { email: decodedEmail };
            const user = await usersCollection.findOne(query);

            if (user?.role !== 'admin') {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next();
        }

        const verifyDoctor = async (req, res, next) => {
            const decodedEmail = req.decoded.email;
            console.log("decodedEmail verifyDoctor", decodedEmail);

            const query = { email: decodedEmail };
            const user = await usersCollection.findOne(query);

            if (user?.role !== 'doctor') {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next();
        }

        // Use Aggregate to query multiple collection and then merge data
        // app.get('/appointmentOptions', async (req, res) => {
        //     const date = req.query.date;
        //     const query = {};
        //     const options = await appointmentOptionCollection.find(query).toArray();

        //     // get the bookings of the provided date
        //     const bookingQuery = { appointmentDate: date }
        //     const alreadyBooked = await bookingsCollection.find(bookingQuery).toArray();

        //     // code carefully :D
        //     options.forEach(option => {
        //         const optionBooked = alreadyBooked.filter(book => book.treatment === option.name);
        //         const bookedSlots = optionBooked.map(book => book.slot);
        //         const remainingSlots = option.slots.filter(slot => !bookedSlots.includes(slot))
        //         option.slots = remainingSlots;
        //     })
        //     res.send(options);
        // });

        app.get('/v2/appointmentOptions', async (req, res) => {
            const date = req.query.date;
            const options = await appointmentOptionCollection.aggregate([
                {
                    $lookup: {
                        from: 'bookings',
                        localField: 'name',
                        foreignField: 'treatment',
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $eq: ['$appointmentDate', date]
                                    }
                                }
                            }
                        ],
                        as: 'booked'
                    }
                },
                {
                    $project: {
                        name: 1,
                        price: 1,
                        slots: 1,
                        booked: {
                            $map: {
                                input: '$booked',
                                as: 'book',
                                in: '$$book.slot'
                            }
                        },
                        doctorName: 1,
                        doctorPhoto: 1  // Ensure this is included in the response
                    }
                },
                {
                    $project: {
                        name: 1,
                        price: 1,
                        slots: {
                            $setDifference: ['$slots', '$booked']
                        },
                        doctorName: 1,
                        doctorPhoto: 1
                    }
                }
            ]).toArray();
            res.send(options);
        })


        app.get('/appointmentSpecialty', async (req, res) => {
            const query = {}
            const result = await appointmentOptionCollection.find(query).project({ name: 1 }).toArray();
            res.send(result);
        })

        // Update Doctor :
        app.put('/v2/updateAppointmentOptions', async (req, res) => {
            try {
                const { specialty, doctorName, doctorPhoto } = req.body;

                console.log(specialty, doctorName, doctorPhoto, "specialty, doctorName, doctorPhoto");

                // Update the appointment options based on the specialty
                const result = await appointmentOptionCollection.updateMany(
                    { name: specialty }, // Match the specialty with the name in the collection
                    {
                        $set: {
                            doctorName: doctorName,
                            doctorPhoto: doctorPhoto
                        }
                    }
                );

                res.status(200).send({
                    message: 'Appointment options updated successfully',
                    modifiedCount: result.modifiedCount,
                });
            } catch (error) {
                console.error('Error updating appointment options:', error);
                res.status(500).send({ error: 'Failed to update appointment options' });
            }
        });


        /***
         * API Naming Convention 
         * app.get('/bookings')
         * app.get('/bookings/:id')
         * app.post('/bookings')
         * app.patch('/bookings/:id')
         * app.delete('/bookings/:id')
        */

        app.get('/bookings', async (req, res) => {
            const email = req.query.email;
            // const decodedEmail = req.decoded.email;

            // if (email !== decodedEmail) {
            //     return res.status(403).send({ message: 'forbidden access' });
            // }

            // const query = { email: email };
            const bookings = await bookingsCollection.find({ email }).toArray();
            res.send(bookings);
        });

        app.get('/bookings/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const booking = await bookingsCollection.findOne(query);
            res.send(booking);
        })

        app.post('/bookings', async (req, res) => {
            const booking = req.body;
            console.log("booking data", booking);
            const query = {
                appointmentDate: booking.appointmentDate,
                email: booking.email,
                treatment: booking.treatment
            }

            const alreadyBooked = await bookingsCollection.find(query).toArray();

            if (alreadyBooked.length) {
                const message = `You already have a booking on ${booking.appointmentDate}`
                return res.send({ acknowledged: false, message })
            }

            const result = await bookingsCollection.insertOne(booking);

            // // send email about appointment confirmation 
            // sendBookingEmail(booking)

            res.send(result);
        });

        app.post('/create-payment-intent', async (req, res) => {
            const booking = req.body;
            const price = booking.price;
            const amount = price * 100;

            const paymentIntent = await stripe.paymentIntents.create({
                currency: 'usd',
                amount: amount,
                "payment_method_types": [
                    "card"
                ]
            });
            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });

        app.post('/payments', async (req, res) => {
            const payment = req.body;
            const result = await paymentsCollection.insertOne(payment);


            const id = payment.bookingId
            const filter = { _id: ObjectId(id) }
            const updatedDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId
                }
            }
            const updateBooking = await bookingsCollection.updateOne(filter, updatedDoc)

            const paidBookingResult = await bookingsCollection.findOne(filter)
            console.log("Paid booking result ", paidBookingResult);
            // // send email about appointment confirmation 
            sendBookingEmail(paidBookingResult)

            res.send(result);
        })

        app.get('/jwt', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            if (user) {
                const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: '24h' })
                return res.send({ accessToken: token });
            }
            res.status(403).send({ accessToken: '' })
        });

        app.get('/users', async (req, res) => {
            const query = {};
            const users = await usersCollection.find(query).toArray();
            res.send(users);
        });

        // Get user data by email
        app.get('/user/mongo', async (req, res) => {
            const email = req.query.email;
            const user = await usersCollection.findOne({ email });
            res.send(user)
        });

        app.get('/users/admin/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email }
            const user = await usersCollection.findOne(query);
            res.send({ isAdmin: user?.role === 'admin' });
        })

        app.get('/users/doctor/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email }
            const user = await usersCollection.findOne(query);
            res.send({ isDoctor: user?.role === 'doctor' });
        })

        app.post('/users', async (req, res) => {node
            const user = req.body;
            console.log("user", user);
            // TODO: make sure you do not enter duplicate user email
            // only insert users if the user doesn't exist in the database
            const result = await usersCollection.insertOne(user);
            res.send(result);
        });

        app.delete('/users/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const result = await usersCollection.deleteOne(filter);
            res.send(result);
        })


        // Role Update : 
        app.put('/users/admin/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) }
            const options = { upsert: true };
            console.log(options, 'options admin');
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await usersCollection.updateOne(filter, updatedDoc, options);
            res.send(result);
        });

        app.put('/users/doctor/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) }
            const options = { upsert: true };
            console.log(options, 'options doctor');
            const updatedDoc = {
                $set: {
                    role: 'doctor'
                }
            }
            const result = await usersCollection.updateOne(filter, updatedDoc, options);
            res.send(result);
        });

        // temporary to update price field on appointment options
        // app.get('/addPrice', async (req, res) => {
        //     const filter = {}
        //     const options = { upsert: true }
        //     const updatedDoc = {
        //         $set: {
        //             price: 99
        //         }
        //     }
        //     const result = await appointmentOptionCollection.updateMany(filter, updatedDoc, options);
        //     res.send(result);
        // })

        app.get('/doctors', /*verifyJWT, verifyAdmin,*/ async (req, res) => {
            const query = { role: 'doctor' };
            const doctors = await usersCollection.find(query).toArray();
            console.log(doctors);
            res.send(doctors);
        })

        app.delete('/doctors/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const result = await usersCollection.deleteOne(filter);
            res.send(result);
        })

        // Post home page:
        app.post('/posts', async (req, res) => {
            const data = req.body;
            const result = await postCollection.insertOne(data)
            res.send(result)
        })

        app.get('/posts', async (req, res) => {
            const postData = postCollection.find({}).sort({ timestamp: -1 });
            const result = await postData.toArray();
            const reversedResult = result.reverse();
            res.send(reversedResult)
        })

        //Get doctor posts
        app.get('/emailPosts', async (req, res) => {
            try {
                const email = req.query.email; // Get the email query parameter from the request
                const query = { userEmail: email }; // Construct the query object
                const result = await postCollection.find(query).toArray();
                res.send(result);
            } catch (error) {
                console.error(error);
                res.status(500).send('Error retrieving posts from MongoDB');
            }
        });

        // Delete Posts:
        app.delete('/deleteItem/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }; // Add the new keyword here
            const result = await postCollection.deleteOne(query);
            res.send(result);
        });



        // *************************> conversations server code Start: <***********************
        // Endpoint to get conversations by user email:

        app.get('/posts', async (req, res) => {
            const postData = postCollection.find({}).sort({ timestamp: -1 });
            const result = await postData.toArray();
            const reversedResult = result.reverse();
            res.send(reversedResult)
        })

        app.get('/conversations/:email', async (req, res) => {
            const { email } = req.params;

            try {
                const conversations = await ConversationCollection.find({
                    'participants.email': email
                }).sort({ timestamp: -1 }).toArray();

                const result = conversations.reverse();

                console.log(result);

                res.status(200).json(result);
            } catch (error) {
                res.status(500).json({ message: 'Error fetching conversations', error });
            }
        });


        // Post Conversations: 

        app.post("/conversations", async (req, res) => {
            try {
                const { email, postId } = req.body || {};
                console.log(email, postId, "email, postId");

                if (!(email && postId)) {
                    return res.status(400).json({
                        error: "Missing required params!",
                        fields: ["email", "postId"],
                    });
                }

                // Retrieve doctor post details
                const doctorPost = await postCollection.findOne({ _id: ObjectId(postId) });
                console.log(doctorPost, "doctorPost");

                if (!doctorPost?._id) {
                    return res.status(404).json({
                        error: "Could not find post!",
                        fields: ["email", "postId"],
                    });
                }

                // Check if the user is the owner of the post
                const isPostOwner = doctorPost?.userEmail === email;
                console.log(isPostOwner, 'isPostOwner');

                // Only create a conversation if the requester is not the post owner (doctor)
                if (!isPostOwner) {
                    // Check if a conversation already exists
                    const existingConversation = await ConversationCollection.findOne({
                        "participants.email": email,
                        postId: ObjectId(postId),
                    });

                    if (!existingConversation?._id) {
                        const { userName: doctorName, userEmail: doctorEmail } = doctorPost;

                        if (!(doctorEmail && doctorName)) {
                            return res.status(404).json({
                                error: "Could not find doctor info!",
                                fields: ["doctorEmail", "doctorName"],
                            });
                        }

                        // Fetch the user details for conversation
                        const user = await usersCollection.findOne({ email });
                        if (!user?._id) {
                            return res.status(404).json({ error: "Could not find user!" });
                        }

                        // Insert new conversation
                        const { insertedId } = await ConversationCollection.insertOne({
                            participants: [
                                { name: user.name, email: user.email },
                                { name: doctorName, email: doctorEmail },
                            ],
                            postId: ObjectId(postId),
                            createdBy: user.email,
                            createdAt: new Date(),
                            updatedAt: new Date(),
                        });

                        if (!insertedId) {
                            return res.status(500).json({ error: "Could not create conversation!" });
                        }
                    }
                }

                // Fetch all conversations for the user related to this post
                const conversations = await ConversationCollection.aggregate([
                    {
                        $match: {
                            "participants.email": email,
                            postId: ObjectId(postId),
                        },
                    },
                    {
                        $lookup: {
                            from: "conversation-messages",
                            localField: "_id",
                            foreignField: "conversationId",
                            as: "conversationMessages",
                        },
                    },
                ]).toArray();

                res.status(200).json({
                    count: conversations.length,
                    conversations,
                    message: "Successfully Fetched",
                    success: true,
                });
            } catch (err) {
                console.error("Error handling conversations:", err);
                res.status(500).json({ error: err.message });
            }
        });


        // delete Conversations:

        // app.delete("/conversations/:id", async (req, res) => {
        //     try {
        //         const conversation = await ConversationCollection.findOne({
        //             _id: req?.params?.id,
        //         });

        //         if (!conversation) {
        //             return res
        //                 .status(400)
        //                 .json({ error: "Could not find conversation!" });
        //         }

        //         const isDeleted = await ConversationCollection.deleteOne({
        //             _id: req?.params?.id,
        //         });

        //         res.status(200).json({
        //             conversation,
        //             message: !!isDeleted
        //                 ? "Successfully Deleted"
        //                 : "Could not delete the conversation!",
        //             success: !!isDeleted,
        //         });
        //     } catch (err) {
        //         res.status(500).json({ error: err.message });
        //     }
        // });


        // post 
        app.post("/conversations/messages", async (req, res, next) => {
            try {
                const { conversationId, message, senderEmail } = req.body || {};

                console.log(conversationId, message, senderEmail, "conversationId, message, senderEmail");

                if (!(conversationId && message && senderEmail)) {
                    return res.status(400).json({ error: "Invalid request!" });
                }

                const senderUser =
                    (await usersCollection.findOne({ email: senderEmail })) || {};
                if (!senderUser) {
                    return res.status(400).json({ error: "Could not find user!" });
                }

                const conversation =
                    (await ConversationCollection.findOne({
                        _id: ObjectId(conversationId),
                    })) || {};
                if (!conversation?._id) {
                    return res
                        .status(400)
                        .json({ error: "Could not find conversation!" });
                }

                const { insertedId } = await ConversationMessageCollection.insertOne({
                    conversationId: ObjectId(conversationId),
                    message,
                    createdBy: senderUser?.email,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
                const conversationMessage = await ConversationMessageCollection.findOne(
                    { _id: insertedId }
                );

                res.status(200).json({
                    conversationMessage,
                    message: !!conversationMessage
                        ? "Successfully Created"
                        : "Could not create conversation message!",
                    success: !!conversationMessage,
                });
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        });



        // get
        app.get("/conversations/messages/:conversationId", async (req, res) => {
            try {
                const conversationMessages = await ConversationMessageCollection.find({
                    conversationId: req?.params?.conversationId,
                }).toArray();

                res.status(200).json({
                    count: conversationMessages?.length,
                    conversationMessages,
                    message: "Successfully Fetched",
                    success: true,
                });
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        });


        // put 
        // app.put("/conversations/messages/:id", async (req, res) => {
        //     try {
        //         const { message } = req?.body || {};
        //         if (!message) {
        //             return res.status(400).json({ error: "Invalid request!" });
        //         }

        //         const conversationMessage = await ConversationMessageCollection.findOne(
        //             {
        //                 _id: req?.params?.id,
        //             }
        //         );

        //         if (!conversationMessage) {
        //             return res
        //                 .status(400)
        //                 .json({ error: "Could not find conversation message!" });
        //         }

        //         const updatedConversationMessage =
        //             await ConversationMessageCollection.update(
        //                 { _id: req?.params?.id },
        //                 { $set: { isUpdated: true, message, updatedAt: new Date() } }
        //             );

        //         res.status(200).json({
        //             conversationMessage: updatedConversationMessage,
        //             message: !!updatedConversationMessage
        //                 ? "Successfully Updated"
        //                 : "Could not update the conversation message!",
        //             success: !!updatedConversationMessage,
        //         });
        //     } catch (err) {
        //         res.status(500).json({ error: err.message });
        //     }
        // });


        // delete 
        // app.delete("/conversations/messages/:id", async (req, res) => {
        //     try {
        //         const conversationMessage = await ConversationMessageCollection.findOne(
        //             {
        //                 _id: req?.params?.id,
        //             }
        //         );

        //         if (!conversationMessage) {
        //             return res
        //                 .status(400)
        //                 .json({ error: "Could not find conversation message!" });
        //         }

        //         const isDeleted = await ConversationMessageCollection.remove({
        //             _id: req?.params?.id,
        //         });

        //         res.status(200).json({
        //             conversationMessage,
        //             message: !!isDeleted
        //                 ? "Successfully Deleted"
        //                 : "Could not delete the conversation message!",
        //             success: !!isDeleted,
        //         });
        //     } catch (err) {
        //         res.status(500).json({ error: err.message });
        //     }
        // });




        // *************************> conversations server code End: <***********************




    }
    finally {

    }
}
run().catch(console.log);

app.get('/', async (req, res) => {
    res.send('doctors portal server is running');
})

app.listen(port, () => console.log(`Doctors portal running on ${port}`))