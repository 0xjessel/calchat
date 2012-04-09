---------------------------------------
GENERAL INFORMATION
---------------------------------------
Application Name: CalChat

Team Name: Team CalChat

Primary Team Contact Name: Jesse Chen

Primary Team Contact E-mail: jesse.chen@berkeley.edu

---------------------------------------
ELEVATOR STATEMENT
---------------------------------------
Please include a short (25-50 word) compelling description of what your application does:
CalChat is a web app that hosts chatrooms for every class and building on campus with the goal of connecting the cal campus
community.  By logging in with Facebook, students can talk to fellow students in the same building or class, make friends,
find study partners, and stay in the loop.  

---------------------------------------
URLS
---------------------------------------
Youtube Walkthrough URL (not to exceed 2 minutes): http://www.youtube.com/watch?v=_4vmN9A20Ig

Working Prototype URL (optional, but highly recommended): http://calchat.net:3000 
(wait!! did you modify your hosts file to run CalChat locally? if so, please comment or delete the modification in your
hosts file so you can view our working prototype)

---------------------------------------
TECHNICAL ASPECT
---------------------------------------
Hardware and Software Requirements (i.e. what OS does it work on?): 
Works on Windows and Mac OS. NodeJS is needed in order to run our app locally.

Please provide brief instructions on how to run your code: 
1. Unzip calchat to where ever you prefer.
2. Go to http://nodejs.org/#. Then download and install the installer for your operating system.

For Macs:
3. Open up the terminal and cd into the calchat folder
4. Enter ‘sudo nano /etc/hosts’
5. At the bottom of the file, add the following in a new line (without the quotes): “127.0.0.1  localhost calchat.net”
6. In the calchat folder, type in “node app.js”
7. Then fire up your browser of choice and go to http://calchat.net:3000 and CalChat should load

For Windows:
3. Run notepad as an administrator. To do this right click note pad and select “run as administrator”
4. Go to File-> Open and open the hosts file (located at ‘C:\Windows\System32\drivers\etc\’)
5. Append this line to the end of your hosts file: "127.0.0.1	localhost	calchat.net"
6. Save this file
7. Open the Command Prompt (Start->Run->’cmd.exe’) and go to the CalChat root directory
8. Run ‘node app.js’
9. Point your browser to: http://calchat.net:3000 and CalChat should load

NOTE: If you wish to visit our working prototype, make sure to remove the modification to your hosts file before trying!
---------------------------------------
INCLUDED FILES
---------------------------------------
Please list the files required to run your application and a brief description of the file's function in your application:

calchat /* node.js with express, socket.io and bootstrap */
|-- app.js /* server code */
|-- util.js /* shared utility functions between app.js and routes/index.js */
|-- routes
|   |-- index.js /* route handling */
|-- public /* static files */
|   |-- css 
|   |   |-- calchat.css /* global css file that is used on all pages */
|   |   |-- bootstrap.css /* bootstrap css file for UI control and design */
|   |   |-- *.css /* individual css files for each endpoint */
|   |-- img 
|   |   |-- carasoul /* carasoul pics for home page */
|   |   `-- ico /* favicon and icon */
|   `-- js
|       |-- libs /* javascript libraries */
|       |   |-- bootstrap /* bootstrap javascript files */
|       |   |-- jquery.history.js /* polyfill for browser history manipulation */
|       |   |-- jquery-1.7.1.min.js /* jquery library */
|       |   |-- linkify.min.js /* render plain text to become links */
|       |   `-- modernizr-2.5.3-respond-1.1.0.min.js /* feature detection */
|       |-- calchat.js /* global js file that is used on all pages */
|       |-- geo.js /* geolocation code to determine location */
|       `-- *.js /* individual js files for each endpoint */
|-- scraper /* java code to scrape schedule.berkeley.edu for classes and building data */
`-- views /* front-end html markup */
    |-- includes /* common html code used on all pages (e.g. head, footer) */
    |-- layout-*.jade /* html layout code for our endpoints */
    `-- *.jade /* html body code for our endpoints */

CalChat is built on top of node.js, which is a platform built on javascript for building fast and scalable applications.
We use several modules, including express (route handling, and http server framework), socket.io (real-time persistent 
communication channel between server and client), and redis (key-value database).  

The app.js file is our server code which handles all the back-end routing and logic.  

routes/index.js is the route handling code which helps direct incoming requests to the appropiate endpoints.  

The util.js file is simply a file that holds shared functions that we use between app.js and routes/index.js.  

public/ contains static files to serve to clients, the folders css/, js/, and img/ serves css, js, and image files 
respectively.  

The public/css/calchat.css file is css that is used on all endpoints.

The public/css/bootstrap*.css files are bootstrap files that are used for popular UI controls and design

All the other public/css/*.css files are individual css files for each endpoint.

The public/js/libs folder contains bootstrap javascript files, History.js (for browser history manipulation), the jquery 
library, linkify (for converting plain text to links), and modernizr (feature detection).

The public/js/calchat.js file contain javascript constants and functions that we use across all endpoints.

The public/js/geo.js as well as public/js/yqlgeo.js contains methods to detect the client's location via HTML5 geolocation
API.

All the other public/js/*.js files are indiviual js files for each endpoint.

scraper/ contains java code that is run separately to populate our redis database with classes and building data.

views/ is all the front-end html markup that we use for each endpoint.

views/includes contains common html code that is used on all pages (e.g. navbar, head, footer)

views/layout-*.jade are layout files that is the complete skeleton for a specific endpoint

views/*.jade are individual body html code that are injected into the corresponding layout file.

---------------------------------------
KNOWN ISSUES
---------------------------------------
Please note any known issues with the functionality of your code. Simply state "No issues found." if you did not find any:
