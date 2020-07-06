module.exports = () => {
    /* ---------------------------------------------------------------------------------------------- */
    /*                                            REQUIRES                                            */
    /* ---------------------------------------------------------------------------------------------- */
    /* ------------------------------------------- Express ------------------------------------------ */
    const express = require('express')                              // Express HTTP/S Server
    const compression = require('compression')                      // Req/Res compression
    const helmet = require('helmet')                                // Express Security Fix
    const session = require('express-session')                      // Sessions
    const flash = require('express-flash')                          // Session Alert Messaging
    const bodyParser = require('body-parser')                       // Req Body Parsing
    const cookieParser = require('cookie-parser')                   // Parses cookies and their data
    /* ------------------------------------- MongoDB (Database) ------------------------------------- */
    const mongoose = require('mongoose')                            // MongoDB driver
    const dbUtil = require('./dbUtil')                              // Database Util Module
    const Users = require('./models/Users')                         // Schema: Users
    /* -------------------------------------------- Auth -------------------------------------------- */
    const bcrypt = require('bcryptjs')                              // User password hashing/comparison
    const passport = require('passport')                            // User sessions, sign ups, sign ons
    const passportInit = require('./passport')                      // Local passport Config
    const auth = require('./auth')                                  // Auth module
    const { body, validationResult } = require('express-validator')   // Validates sign up/in information
    /* ------------------------------------------- General ------------------------------------------ */
    const path = require('path')                                    // FS path resolving, validation, etc
    const fs = require('fs')                                        // File System interface
    const dotenv = require('dotenv')                                // .env file config

    /* ---------------------------------------------------------------------------------------------- */
    /*                                         INITIALIZATIONS                                        */
    /* ---------------------------------------------------------------------------------------------- */
    /* ------------------------------------------ Env Vars ------------------------------------------ */
    if (process.env.NODE_ENV != 'production') dotenv.config()       // Load local .env config if not prod
    /* -------------------------------------------- Auth -------------------------------------------- */
    passportInit(passport)                                          // Loads and uses local passport config
    /* ------------------------------------------- Express ------------------------------------------ */
    const app = express()                                           // Creates express HTTP server
    app.listen(process.env.PORT || 3080)                            // Listens on environemnt set port
    console.log('Ideoxan Server Online')

    app.use('/static', express.static('static'))                    // Serves static files
    app.set('view engine', 'ejs')                                   // Renders EJS files
    app.use(express.urlencoded({ extended: true }))                 //Encoded URLS

    app.use(session({                                               // Sessions
        secret: process.env.EXPRESS_SESSION_SECRET,                 // Use environment set secret
        saveUninitialized: false,                                   // Do not save uninitialized sessions
        resave: false,                                              // Do not write local sessions if not needed
    }))
    app.use(passport.initialize())                                  // Init passport
    app.use(passport.session())                                     // Init sessions

    app.use(cookieParser(process.env.EXPRESS_SESSION_SECRET))       // Parses cookies using the env SS
    app.use(bodyParser.urlencoded({ extended: true }))              // Body parser
    app.use(helmet())                                               // Express security
    app.use(compression())                                          // Gzips res
    app.use(flash())                                                // Session alert messaging
    /* ------------------------------------- MongoDB (Database) ------------------------------------- */
    // Connects to the local or internet database (I suggest local btw) using valid mongo uri 
    // Uses Mongoose drivers for Mongo DB because native ones are awful :^)
    mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/ix", {
        useNewUrlParser: true,                                      // Required
        useUnifiedTopology: true                                    // Required
    })

    /* ---------------------------------------------------------------------------------------------- */
    /*                                            CONSTANTS                                           */
    /* ---------------------------------------------------------------------------------------------- */
    // Most stuff is .env anyways...

    /* ---------------------------------------------------------------------------------------------- */
    /*                                             SERVER                                             */
    /* ---------------------------------------------------------------------------------------------- */
    /* ----------------------------------------- Main Pages ----------------------------------------- */
    // The main pages are pages that are typically not too dynamic and are part of the main front face
    // of the website (stuff like the homepage, catalogue, etc.)
    app.get('/', async (req, res) => {
        renderCustomPage(req, res, 'index')                         // Renders homepage
    })

    app.get('/index*', async (req, res) => {
        renderPage(req, res)                                        // Renders homepage
    })

    app.get('/catalogue*', async (req, res) => {
        renderPage(req, res)                                        // Renders catalogue (YES JVAKUT ITS SPELLED THIS WAY)
    })

    app.get('/pricing*', async (req, res) => {
        renderPage(req, res)                                        // Renders pricing page
    })

    app.get('/about*', async (req, res) => {
        renderPage(req, res)                                        // Renders about page
    })

    app.get('/tos*', async (req, res) => {
        renderPage(req, res)                                        // Renders TOS page
    })

    app.get('/privacy*', async (req, res) => {
        renderPage(req, res)                                        // Renders Privacy Policy page
    })

    /* ------------------------------------------ Accounts ------------------------------------------ */
    // The account pages are dynamic based on account status. These tend to be authorization pages (ie.
    // login, sign up, account management, profiles, etc.)
    app.get('/login*', auth.isNotAuth, async (req, res) => {        // Checks if not auth
        res.render('login', { auth: false })                        // Renders login page (auth forced off)
    })

    app.get('/signup*', auth.isNotAuth, async (req, res) => {       // Checks if not auth
        res.render('signup', { auth: false })                       // Renders signup page (auth forced off)
    })

    /* --------------------------------------------- API -------------------------------------------- */
    // API pages are pages that deal with the interal API used to control essential features of the site
    // This can range from authentication to data management to data reporting.
    // These paths typically start with /api/v<VERSION_NUMBER>/~

    // SPEC: V1 API
    // UPDATED: 2020 07 02

    // USER
    // > CREATE
    // Creates a new User Account with the proper parameters
    // This accepts 3 parameters specified in the body of the document.
    /**
     * @param {String} req.body.displayName - The display name of the user (non-unique). Can be changed
     * @param {String} req.body.email - A valid email used to authenticate an account (unique)
     * @param {String} req.body.password - A password (min: 6, max: 254 chars)
     */
    // If the request is a valid one (valid email, valid passowrd, valid displayName), then the server
    // redirects to the login page for authentication. If not, a 422 ERR_BADENT (HTTP: Unprocessable
    // Entity) is returned. This is often due to the fact that the user already exists within the DB or
    // at least one of the fields is invalid
    app.post('/api/v1/user/create', [
        body('email').isEmail(),
        body('password').isLength({ min: 6, max: 254 }),
        body('displayName').isAlphanumeric().isLength({ min: 3, max: 254 })
    ], auth.isNotAuth, async (req, res) => {
        const validationErr = validationResult(req)
        if (!validationErr.isEmpty() || await dbUtil.user.getUserByEmail(req.body.email)) {
            res.status(422)
            if (req.accepts('html')) {
                req.flash('error', 'Invalid Email, Username, or Password')
                res.redirect('/signup')
            } else if (req.accepts('json')) {
                res.json({
                    error: 422,
                    code: 'ERR_BADENT',
                    message: 'Unprocessable Entity'
                })
            } else {
                res.send('Unprocessable Entity')
            }
        } else {
            await Users.create({
                displayName: req.body.displayName,
                email: req.body.email,
                password: await bcrypt.hash(req.body.password, Number.parseInt(process.env.PWD_HASH))
            })
            res.redirect('/login')
        }
    })

    // > AUTH
    // Authenticates a user and provides a fully authenticated session
    // This accepts 2 parameters specified in the body of the document
    /**
     * @param {String} req.body.email - A valid email used to authenticate an account (unique)
     * @param {String} req.body.password - A password (min: 6, max: 254 chars)
     */
    // If the request is a valid one (valid email, valid passowrd) and correct (email and password
    // correspond in the database), then the server redirects to the index page. If not, the server
    // redirects to the login page. This is often due to the fact that the user is banned, one of the
    // fields is invalid, or the user does not exist
    //
    // See passport.js for more information
    app.post('/api/v1/user/auth', auth.isNotAuth, passport.authenticate('local', {
        successRedirect: '/',
        failureRedirect: '/login',
        failureFlash: true,
        successFlash: true,
    }))

    // > DEAUTH
    // Removes authenticates from a user and provides invalidates an authenticated session
    // If the request is a valid one, then the request session corresponding to the user is deleted,
    // nullified, or invalidated. The user is then logged out of the session and redirected to the index
    // page
    app.get('/api/v1/user/deauth', auth.isAuth, async (req, res) => {
        req.logOut()
        if (req.session) req.session.destroy()
        if (req.accepts('html')) {
            res.redirect('/')
        }
    })

    /* ------------------------------------------- Editor ------------------------------------------- */
    app.get('/editor/:course/:chapter/:lesson', async (req, res) => {
        if (await validateLessonPath(req.params.course, req.params.chapter, req.params.lesson)) { // Makes sure the lesson is valid
            res.render('editor', {
                ServerAppData: { //here for a reason just leave it alone :^)
                    ideoxan: {
                        lessonData: {
                            course: req.params.course,
                            chapter: req.params.chapter,
                            lesson: req.params.lesson,
                            meta: JSON.stringify(await readIXConfig(`../static/curriculum/curriculum-${req.params.course}/.ideoxan`))
                        }
                    }
                }
            })
        } else {
            res.status(404)                                         // If its not valid give a 404
            if (req.accepts('html')) {                              // Check accepted types
                res.render('error', { errNum: 404, message: 'Seems like this page doesn\'t exist.', code: 'ERR_PAGE_NOT_FOUND' })
            } else if (req.accepts('json')) {
                res.json({ error: 404, code: 'ERR_PAGE_NOT_FOUND', message: 'Not Found' })
            } else {
                res.send('Not Found')
            }
        }
    })

    app.get('/ping', async (req, res) => {                          // Server ping (check alive in editor)
        res.status(200)                                             // Can be used for other things ig but idc lol
        res.end('All Good :)')
    })


    app.use(async (req, res, next) => {                             // If there are no more routes to follow then
        res.status(404)                                             // throw a 404.
        if (req.accepts('html')) {                                  // Check accepted types
            res.render('error', { errNum: 404, message: 'Seems like this page doesn\'t exist.', code: 'ERR_PAGE_NOT_FOUND' })
        } else if (req.accepts('json')) {
            res.json({ error: 404, code: 'ERR_PAGE_NOT_FOUND', message: 'Not Found' })
        } else {
            res.send('Not Found')
        }
    })

    app.use(async (err, req, res, next) => {                        // If there is a server side error thrown then
        res.status(500)                                             // Give a 500 error (if possible)
        console.error(err.stack)                                    // Log the error
        if (req.accepts('html')) {                                  // Check accepted types
            // Look into consolidating this into a function would ya?
            res.render('error', { errNum: 500, message: 'Looks like something broke on our side', code: 'ERR_INTERNAL_SERVER' }) 
        } else if (req.accepts('json')) {
            res.json({ error: 500, code: 'ERR_INTERNAL_SERVER', message: 'Internal Server Error' })
        } else {
            res.send('Internal Server Error')
        }

    })


    /* ---------------------------------------------------------------------------------------------- */
    /*                                             METHODS                                            */
    /* ---------------------------------------------------------------------------------------------- */

    /**
     * Reads a .ideoxan configuration file in a course directory and returns a JSON object
     * 
     * @param {String} path A valid path to a course directory
     * @returns {Promise<JSON>} A JSON object of course metadata/configuration
     */
    async function readIXConfig(path) {
        try {
            let data = await fs.promises.readFile(require.resolve(path))
            return (data) ? JSON.parse(data) : null
        } catch (err) {
            return null
        }
    }

    /**
     * Checks to see if a valid course/lesson path configuration was given
     * 
     * @param {String} course The name of the course
     * @param {String} [chapter=] The chapter number (given in 3 place format)
     * @param {String} [lesson=] The lesson number (given in 3 place format)
     * @returns {Promise<Boolean>}
     */
    async function validateLessonPath(course, chapter, lesson) {
        try {
            (typeof lesson == 'undefined') ? await fs.promises.access(`./static/curriculum/curriculum-${course}`, fs.constants.R_OK) : await fs.promises.access(`./static/curriculum/curriculum-${course}/content/chapter-${chapter}/${lesson}`, fs.constants.R_OK)
            return true
        } catch (err) {
            return false
        }
    }

    /**
     * Renders a page found in the specified views directory based on what was requested
     * @param {Request} req - A HTTP request
     * @param {Response} res - A HTTP response
     */
    async function renderPage(req, res) {
        if (typeof req.session.passport != 'undefined' && typeof req.session.passport !== 'null') {
            let user = await dbUtil.user.getUserByUserID(req.session.passport.user)
            res.render(req.path.substring(1), { auth: true, displayName: user.displayName, courses: await getAvailableCourses() })
        } else {
            res.render(req.path.substring(1), { auth: false, courses: await getAvailableCourses() })
        }
    }

    /**
     * Renders a page found in the specified views directory based on specified page.
     * @param {Request} req - A HTTP request
     * @param {Response} res - A HTTP response
     * @param {String} page - The name of a template page to render (independent from request)
     */
    async function renderCustomPage(req, res, page) {
        try {
            if (typeof req.session.passport != 'undefined' && typeof req.session.passport !== 'null') {
                let user = await dbUtil.user.getUserByUserID(req.session.passport.user)

                if (user == null) {
                    return res.render(page, { auth: false, courses: await getAvailableCourses() })
                }

                return res.render(page, { auth: true, displayName: user.displayName, courses: await getAvailableCourses()  })

            } else {
                return res.render(page, { auth: false, courses: await getAvailableCourses() })
            }
        } catch (err) {
            res.status(500)
            console.error(err.stack)
            if (req.accepts('html')) {
                res.render('error', { errNum: 500, message: 'Looks like something broke on our side', code: 'ERR_INTERNAL_SERVER' })
            } else if (req.accepts('json')) {
                res.json({ error: 500, code: 'ERR_INTERNAL_SERVER', message: 'Internal Server Error' })
            } else {
                res.send('Internal Server Error')
            }
        }

    }

    async function getAvailableCourses() {
        let courses = []
        let avail = await fs.promises.readdir('./static/curriculum')
        for (let course in avail) {
            if (avail[course] != 'courses.json') courses.push(await readIXConfig(`../static/curriculum/${avail[course]}/.ideoxan`))
        }
        return courses
    }
}