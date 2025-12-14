const express = require('express')
const cors = require('cors')
const app = express()
const port = process.env.PORT || 5550
require('dotenv').config()
const stripe = require('stripe')(process.env.STRIPE_SECRET);
app.use(cors())
app.use(express.json())

app.get('/', (req, res) => {
    res.send('Hello World!')
})

const admin = require("firebase-admin");

const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf-8')
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const verifyFBToken = async (req, res, next) => {
    const token = req?.headers?.authorization;

    // console.log(token)

    if (!token) {
        return res.status(401).send({ message: 'unauthorized access' })
    }

    try {
        const idToken = token.split(' ')[1];
        const decoded = await admin.auth().verifyIdToken(idToken)
        req.decoded_email = decoded.email
        next()
    }
    catch {
        res.status(401).send({ message: 'unauthorized access' })
    }
}

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.n8udp2w.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        const database = client.db('assignment_11_user')

        const usersCollection = database.collection('users');
        const assetsCollection = database.collection('assets');
        const requestsCollection = database.collection('requests');
        const assignedAssetsCollection = database.collection('assigned-assets');
        const affiliationsCollection = database.collection('affiliations');
        const packagesCollection = database.collection('packages')
        const paymentsCollection = database.collection('payments')

        paymentsCollection.createIndex(
            { transactionId: 1 },
            { unique: true }
        )

        const verifyEmployee = async (req, res, next) => {
            const email = req.decoded_email;
            const query = { email: email };
            console.log(email)
            const user = await usersCollection.findOne(query);
            console.log(user)
            if (!user || user.role !== 'employee') {
                return res.status(403).send({ message: 'unauthorized access' })
            }
            next()
        }

        const verifyHR = async (req, res, next) => {
            const email = req.decoded_email;
            const query = { email: email };
            console.log(email)
            const user = await usersCollection.findOne(query);
            console.log(user)
            if (!user || user.role !== 'hr') {
                return res.status(403).send({ message: 'unauthorized access' })
            }
            next()
        }

        app.post('/users', async (req, res) => {
            const user = req.body;
            const { email } = user;

            const query = { email };

            const existingUser = await usersCollection.findOne(query);
            if (existingUser) {
                res.status(409).send({ message: 'user already exists' })
            }

            const result = await usersCollection.insertOne(user)
            res.send(result)
        })

        app.get('/users', async (req, res) => {
            const { email, role } = req.query;

            const query = {};

            if (email) {
                query.email = email

                const result = await usersCollection.findOne(query)
                return res.send(result)
            }

            if (role) {
                query.role = role

                const result = await usersCollection.find(query).toArray();
                return res.send(result)
            }

            const result = await usersCollection.find(query).toArray();
            res.send(result)
        })

        app.post('/assets', verifyFBToken, verifyHR, async (req, res) => {
            const asset = req.body;

            const { productName, companyName } = asset

            const existingAsset = await assetsCollection.findOne({ productName, companyName });
            if (existingAsset) {
                return res.status(409).send({ message: 'asset already exists' })
            }

            const result = await assetsCollection.insertOne(asset);
            res.send(result)
        })

        // app.get('/assets', verifyFBToken, async (req, res) => {
        // const { page, limit } = req.query;
        // const result = await assetsCollection.find({}).toArray();
        // res.send(result)
        // })

        app.get('/assets', verifyFBToken, async (req, res) => {
            const page = Math.max(1, parseInt(req.query.page) || 1);
            const limit = Math.max(1, parseInt(req.query.limit) || 10);
            const hrEmail = req.query.hrEmail;

            let filter = {}

            if (page && limit && hrEmail) {
                filter = { hrEmail }
                const skip = (page - 1) * limit;
                const total = await assetsCollection.countDocuments(filter);
                const assets = await assetsCollection.find(filter).sort({ dateAdded: -1 }).skip(skip).limit(limit).toArray();
                return res.send({ data: assets, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
            }

            else {
                const result = await assetsCollection.find(filter).toArray();
                return res.send(result)
            }
        });

        app.patch('/assets', verifyFBToken, verifyHR, async (req, res) => {
            console.log('dfs', req.body)
            const { id } = req.query;
            const { productName, productImage, productType, productQuantity } = req.body

            const query = { _id: new ObjectId(id) }

            let updatedInfo = {}

            if (productImage) {
                updatedInfo = {
                    $set: {
                        productName: productName,
                        productImage: productImage,
                        productType: productType,
                        productQuantity: productQuantity
                    }
                }
            }

            else {
                updatedInfo = {
                    $set: {
                        productName: productName,
                        productType: productType,
                        productQuantity: productQuantity
                    }
                }
            }

            const result = await assetsCollection.updateOne(query, updatedInfo);
            res.send(result)
        })

        app.patch('/assets/:id', verifyFBToken, verifyHR, async (req, res) => {

            const id = req.params.id;

            const query = { _id: new ObjectId(id) };

            const updatedInfo = {
                $inc: {
                    availableQuantity: -1
                }
            }

            const result = await assetsCollection.updateOne(query, updatedInfo)
            res.send(result)
        })

        app.delete('/assets', verifyFBToken, verifyHR, async (req, res) => {
            const { id } = req.query

            const query = { _id: new ObjectId(id) }

            const result = await assetsCollection.deleteOne(query);
            res.send(result)
        })

        app.post('/requests', verifyFBToken, verifyEmployee, async (req, res) => {
            const request = req.body

            const { assetId, requesterEmail, requestStatus } = request

            const query = { assetId, requesterEmail, requestStatus };

            const existingRequest = await requestsCollection.findOne(query);

            if (existingRequest) {
                return res.status(409).send({ message: 'request already exists' })
            }

            const result = await requestsCollection.insertOne(request)
            res.send(result)
        })

        app.get('/requests', verifyFBToken, async (req, res) => {
            const { assetId, hrEmail, requesterEmail } = req.query;

            let query = {}

            if (assetId) {
                query = { assetId }

                const result = await requestsCollection.findOne(query);
                return res.send(result)
            }

            if (hrEmail) {
                query = { hrEmail }

                const result = await requestsCollection.find(query).toArray();
                return res.send(result)
            }

            if (requesterEmail) {
                query = { requesterEmail }

                const result = await requestsCollection.find(query).toArray();
                return res.send(result)
            }

            const result = await requestsCollection.find(query).toArray();
            res.send(result)
        })

        app.patch('/requests', verifyFBToken, verifyHR, async (req, res) => {

            const { requestStatus, approvalDate } = req.body
            const { id } = req.query

            const query = { assetId: id }

            const updatedStatus = {
                $set: {
                    requestStatus: requestStatus,
                    approvalDate: approvalDate
                }
            }

            const result = await requestsCollection.updateOne(query, updatedStatus);
            res.send(result)
        })

        app.patch('/requests/:id', verifyFBToken, verifyHR, async (req, res) => {
            const { requestStatus } = req.body

            const id = req.params.id;

            const query = { assetId: id }
            const updatedStatus = {
                $set: {
                    requestStatus: requestStatus
                }
            }
            const result = await requestsCollection.updateOne(query, updatedStatus);
            res.send(result)
        })

        app.post('/assigned-assets', verifyFBToken, verifyHR, async (req, res) => {
            const assignedAsset = req.body;
            const { employeeEmail, assetId } = assignedAsset

            const query = { employeeEmail, assetId };

            const existingAssignedAsset = await assignedAssetsCollection.findOne(query)

            if (existingAssignedAsset) {
                return res.status(409).send({ message: 'assigned asset already exists' })
            }

            const result = await assignedAssetsCollection.insertOne(assignedAsset);
            res.send(result)
        })

        app.get('/assets/:id', verifyFBToken, verifyHR, async (req, res) => {
            const id = req.params.id

            const query = { _id: new ObjectId(id) }

            const result = await assetsCollection.findOne(query);
            res.send(result)
        })

        app.get('/users/:email', verifyFBToken, verifyHR, async (req, res) => {
            const email = req.params.email;

            const query = { email: email };

            const result = await usersCollection.findOne(query);
            res.send(result)
        })

        app.post('/affiliations', verifyFBToken, verifyHR, async (req, res) => {
            const affiliation = req.body
            const { employeeEmail, hrEmail } = affiliation;

            const query = { employeeEmail, hrEmail }

            const existingAffiliation = await affiliationsCollection.findOne(query);
            if (existingAffiliation) {
                return res.status(409).send({ message: 'affiliation already exists' })
            }

            const result = await affiliationsCollection.insertOne(affiliation);
            res.send(result)
        })

        app.get('/assigned-assets', verifyFBToken, async (req, res) => {
            const { searchAsset } = req.query

            const query = {}

            if (searchAsset) {
                query.$or = [
                    { assetName: { $regex: searchAsset, $options: 'i' } }
                ]
            }

            const result = await assignedAssetsCollection.find(query).toArray();
            res.send(result)
        })

        app.patch('/affiliations', verifyFBToken, verifyEmployee, async (req, res) => {
            const { employeeEmail, companyName } = req.query

            const query = { employeeEmail, companyName }

            const updatedStatus = {
                $set: {
                    status: 'active'
                }
            }

            const result = await affiliationsCollection.updateOne(query, updatedStatus)
            res.send(result)
        })

        app.patch('/requests', verifyFBToken, verifyEmployee, async (req, res) => {
            const { assetId, requesterEmail } = req.query;

            const query = { assetId, requesterEmail }

            const updatedStatus = {
                $set: {
                    requestStatus: 'returned'
                }
            }

            const result = await requestsCollection.updateOne(query, updatedStatus)
            res.send(result)
        })

        app.patch('/assigned-assets/:id', verifyFBToken, verifyEmployee, async (req, res) => {
            const id = req.params;
            const { returnDate } = req.body;

            const query = { _id: new ObjectId(id) };

            const updatedStatus = {
                $set: {
                    returnDate: returnDate,
                    status: 'returned'
                }
            }

            const result = await assignedAssetsCollection.updateOne(query, updatedStatus);
            res.send(result)
        })

        app.get('/packages', async (req, res) => {
            const { name } = req.query
            let query = {}

            if (name) {
                query.$or = [{ name: { $regex: name, $options: 'i' } }]


                const result = await packagesCollection.findOne(query)
                return res.send(result)
            }

            const result = await packagesCollection.find(query).toArray();
            res.send(result)
        })

        app.post('/create-checkout-session', async (req, res) => {
            const paymentInfo = req?.body;
            // console.log(paymentInfo?.amount)
            const amount = parseInt(paymentInfo?.amount) * 100;
            const employeeLimit = parseInt(paymentInfo?.employeeLimit)
            const session = await stripe.checkout.sessions.create({
                line_items: [
                    {
                        // Provide the exact Price ID (for example, price_1234) of the product you want to sell
                        price_data: {
                            currency: 'USD',
                            unit_amount: amount,
                            product_data: {
                                name: paymentInfo?.packageName
                            }
                        },
                        quantity: 1,
                    },
                ],
                mode: 'payment',
                metadata: {
                    hrEmail: paymentInfo?.hrEmail,
                    packageName: paymentInfo?.packageName,
                    employeeLimit: employeeLimit
                },
                // customer_email: paymentInfo?.senderEmail,
                success_url: `${process.env.SITE_DOMAIN}/dashboard/upgrade-success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${process.env.SITE_DOMAIN}/dashboard/upgrade-cancelled`
            });
            // console.log(session)
            res.send({ url: session?.url })
        });

        // app.post('/confirm-payment', async (req, res) => {
        // const { sessionId } = req.body
        // const session = await stripe.checkout.sessions.retrieve(sessionId)
        // if (session.payment_status !== 'paid') {
        // return res.status(400).send({ message: 'Payment not completed' })
        // }
        // const payment = {
        // hrEmail: session.metadata.hrEmail,
        // packageName: session.metadata.packageName,
        // employeeLimit: parseInt(session.metadata.employeeLimit),
        // amount: session.amount_total / 100,
        // transactionId: session.payment_intent,
        // paymentDate: new Date(),
        // status: 'completed'
        // }
        // await paymentsCollection.insertOne(payment)
        // await usersCollection.updateOne({
        // email: session.metadata.hrEmail
        // },
        // {
        // $set: {
        // packageName: session.metadata.packageName,
        // employeeLimit: parseInt(session.metadata.employeeLimit)
        // }
        // }
        // )
        // res.send({ success: true })
        // })
        // 
        app.patch('/payment-success', async (req, res) => {
            try {
                const sessionId = req.query.session_id;

                if (!sessionId) {
                    return res.status(400).send({ error: 'session_id is required' });
                }
                const session = await stripe.checkout.sessions.retrieve(sessionId);

                if (session.payment_status !== 'paid') {
                    return res.send({
                        success: false,
                        message: 'Payment not completed'
                    });
                }

                const transactionId = session.payment_intent;

                const payment = {
                    hrEmail: session.metadata.hrEmail,
                    packageName: session.metadata.packageName,
                    employeeLimit: Number(session.metadata.employeeLimit),
                    amount: session.amount_total / 100,
                    transactionId,
                    paymentDate: new Date(),
                    status: 'completed'
                };

                try {
                    await paymentsCollection.insertOne(payment);
                } catch (error) {
                    if (error.code === 11000) {
                        return res.send({
                            success: true,
                            message: 'Duplicate payment ignored',
                            transactionId
                        });
                    }
                    throw error;
                }
                const updatedPackage = await packagesCollection.findOneAndUpdate(
                    { name: session.metadata.packageName },
                    { $inc: { employeeLimit: 1 } },
                    { returnDocument: 'after' }
                );

                res.send({
                    success: true,
                    transactionId,
                    updatedPackage
                });

            } catch (error) {
                console.error('Payment Success Error:', error);
                res.status(500).send({ error: 'Payment processing failed' });
            }
        });



        // app.patch('/payment-success', async (req, res) => {
        // try {
        // const sessionId = req.query.session_id;
        // if (!sessionId) return res.status(400).send({ message: "Session ID is required" });
        // const session = await stripe.checkout.sessions.retrieve(sessionId);
        // const transactionId = session.payment_intent;
        // const paymentExist = await paymentsCollection.findOne({ transactionId });
        // if (paymentExist) {
        // return res.send({
        // message: "payment already exists",
        // transactionId
        // });
        // }
        // if (session.payment_status !== 'paid') {
        // return res.status(400).send({ message: "Payment not completed yet" });
        // }
        // const packageName = session.metadata.packageName;
        // const update = { $inc: { employeeLimit: 1 } };
        // const result = await packagesCollection.findOneAndUpdate(
        // { name: packageName },
        // update,
        // { returnDocument: 'after' }
        // );
        // const updatedPackage = result.value;
        // const payment = {
        // hrEmail: session.metadata.hrEmail,
        // packageName: packageName,
        // employeeLimit: updatedPackage.employeeLimit,
        // amount: Number(session.amount_total) / 100,
        // transactionId: transactionId,
        // paymentDate: new Date(),
        // status: 'completed'
        // };
        // const resultPayment = await paymentsCollection.insertOne(payment);
        // res.send({
        // success: true,
        // modifiedEmployeeLimit: updatedPackage,
        // transactionId: transactionId,
        // paymentInfo: resultPayment
        // });
        // } catch (err) {
        // console.error(err);
        // res.status(500).send({ success: false, message: err.message });
        // }
        // });


        app.get('/payment-history', verifyFBToken, verifyHR, async (req, res) => {
            const email = req.decoded_email

            const history = await paymentsCollection.find({ hrEmail: email }).sort({ paymentDate: -1 }).toArray()

            res.send(history)
        })

        app.get('/affiliations', verifyFBToken, async (req, res) => {
            const { hrEmail, companyName, employeeEmail } = req.query

            let query = {}

            if (hrEmail) {
                query = { hrEmail }

                const result = await affiliationsCollection.find(query).toArray()
                return res.send(result)
            }

            if (companyName) {
                query = { companyName }

                const result = await affiliationsCollection.find(query).toArray();
                return res.send(result)
            }

            if (employeeEmail) {
                query = { employeeEmail }

                const result = await affiliationsCollection.find(query).toArray();
                return res.send(result)
            }

            const result = await affiliationsCollection.find(query).toArray();
            res.send(result)
        })

        app.delete('/affiliations', verifyFBToken, verifyHR, async (req, res) => {
            const { email } = req.query;

            const query = { employeeEmail: email };

            const result = await affiliationsCollection.deleteOne(query);
            res.send(result)
        })

        app.patch('/users', verifyFBToken, verifyEmployee, async (req, res) => {
            const { name, profileImage } = req.body
            const { email } = req.query
            console.log(name, profileImage)
            const query = { email };

            const updatedProfile = {
                $set: {
                    name: name,
                    profileImage: profileImage
                }
            }

            const result = await usersCollection.updateOne(query, updatedProfile);
            res.send(result)
        })

        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})