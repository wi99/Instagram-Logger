// ==UserScript==
// @name         Instagram Logger
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Log stuff on the instagram homepage. It will only log what you see.
// @author       William Situ
// @match        https://www.instagram.com/
// @match        https://www.instagram.com/accounts/activity/
// @include      https://www.instagram.com/stories/*/
// @grant        none
// ==/UserScript==

function parsePost(articElem){
    return {'shortcode': articElem.getElementsByTagName('a')[articElem.getElementsByTagName('a').length-1].href.split('/').slice(-2)[0],
            'timestamp': Math.floor(Date.parse(articElem.getElementsByTagName('time')[0].attributes.datetime.value) / 1000), // Instagram uses unix epoch time so I will too.
            'username': articElem.getElementsByTagName('a')[0].href.split('/').slice(-2)[0]} // normally second <a> is username, but when there's a story first <a> is username. URL works either way.
}
function logPosts(posts_list){
    var posts_observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
            if (mutation.type == 'childList' && mutation.addedNodes[0] && mutation.addedNodes[0].tagName == 'ARTICLE') {
                logData('posts', parsePost(mutation.addedNodes[0]));
            }
        });
    });

    for (var i=0;i<posts_list.children.length;i++){
        if (posts_list.children[i].tagName == 'ARTICLE')
            logData('posts', parsePost(posts_list.children[i]));
    }
    posts_observer.observe(posts_list, {attributes: true, childList: true, characterData: true});
}

function parseStory(divElem){
    return {'timestamp': Math.floor(Date.parse(divElem.getElementsByTagName('time')[0].attributes.datetime.value) / 1000),
            'username': divElem.getElementsByTagName('span')[1].innerText}
}
function logStories(stories_list){
    var stories_observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
            if (mutation.type == 'childList' && mutation.addedNodes[0]) {
                logData('stories', parseStory(mutation.addedNodes[0]));
            }
        });
    });

    for (var j=0;j<stories_list.children.length;j++){
        logData('stories', parseStory(stories_list.children[j]));
    }
    stories_observer.observe(stories_list, {attributes: true, childList: true, characterData: true});
}

function parseAction(divElem){
    //console.log(divElem);
    return {'username': divElem.getElementsByTagName('a')[0].href.split('/').slice(-2)[0],
            'action': divElem.children[1].childNodes[0].data.trim()+divElem.children[1].childNodes[2].data.trim(), // only "Your facebook friend is on Instagram as" uses childNodes[0]. TODO: decide whether to log that facebook thing
            'timestamp': Math.floor(Date.parse(divElem.getElementsByTagName('time')[0].attributes.datetime.value) / 1000)}
}
function logActivity(activity_list) {
    var activity_observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
            if (mutation.type == 'childList' && mutation.addedNodes[0]) {
                logData('activity', parseAction(mutation.addedNodes[0]));
            }
        });
    });
    for (var i = 0; i < activity_list.children.length; i++) {
        logData('activity', parseAction(activity_list.children[i]));
    }
    activity_observer.observe(activity_list, {attributes: true, childList: true, characterData: true});
}

/* check support for indexedDB */ if (!window.indexedDB) {
    window.alert('No support for IndexedDB');
}

/**
 * Data to indexedDB
 * @param {String} storeName - name of object store in indexedDB to log it in
 * @param {JSON} item - JSON object to log
 */
function logData(storeName, item){
    var request = indexedDB.open('InstagramLog', 1); // starts from 1

    request.onerror = function(event) {
        console.log("Why didn't you allow me to use IndexedDB?!");
    };

    request.onupgradeneeded = function(event) {
        var db = event.target.result;

        var objectStore = db.createObjectStore("posts", { keyPath: "shortcode" });
        objectStore.createIndex("timestamp", "timestamp");
        objectStore.createIndex("username", "username");

        /* if(db.objectStoreNames.contains('stories')) { // what if something weird was set as the keypath/index? TODO: if weird then revert to normal.
                    objectStore2 = event.target.transaction.objectStore('stories');
                    objectStore2.deleteIndex('username');
                    objectStore2.createIndex('');
                } else {*/
        var objectStore2 = db.createObjectStore("stories", { keyPath: ['timestamp', 'username']});
        objectStore2.createIndex("timestamp", "timestamp");
        objectStore2.createIndex("username", "username");
        var objectStore3 = db.createObjectStore("activity", { keyPath: ['timestamp', 'username']});
        objectStore3.createIndex("timestamp", "timestamp");
        objectStore3.createIndex("action", "action");
        objectStore3.createIndex("username", "username");
    };

    request.onsuccess = function(event) {
        var db = event.target.result;
        var tx = db.transaction(storeName, "readwrite"); // ['posts', 'stories', 'activity'] also works here
        var store = tx.objectStore(storeName);

        //console.log(JSON.stringify(item))
        store.add(item) // no need to overwrite so I use add() instead of put()

        tx.onerror = function(){
            //console.log('tx.onerror') // I wonder if I should handle duplicate entry myself instead of pushing it to error
            db.close();
        }
        tx.oncomplete = function() {
            console.log('tx.oncomplete')
            db.close();
        };
    };
}

if (document.documentElement.classList.contains('logged-in')){
    // Only mutation observers need to stay in the event listener
    window.addEventListener('load', function() {

        function homeMode(){
            /* Posts Logging*/
            try{
                if (document.documentElement.classList.contains('touch')){ // mobile
                    logPosts(document.getElementsByTagName('main')[0].children[0].lastElementChild.children[0].children[0]);
                }
                else{ // desktop
                    logPosts(document.getElementsByTagName('main')[0].children[0].children[0].children[0].children[0]);
                }
            }
            catch(e){ // This is not expected to happen
                console.log('unexpected' + e)
            }
            finally{
            }

            /* Stories Logging */
            try{
                if (!document.documentElement.classList.contains('touch')){ // only do desktop b/c they don't timestamp on mobile
                    logStories(document.getElementsByTagName('main')[0].children[0].lastElementChild.children[3].children[0].children[0])
                }
            }
            catch(e){ // on desktop web, stories don't show if window width too small.
                // TODO: mutation observer for this instead
                setTimeout(logStories, 30000) // maybe doubleing time better
            }
            finally{
            }

            /* Activity Logging */
            // FYI: followers is in the zip data download but other people's likes is not
            try{
                if (!document.documentElement.classList.contains('touch')){ // activity is not a drop down for mobile
                    // activity_list is at
                    // document.getElementsByClassName('coreSpriteDesktopNavActivity')[0].parentNode.lastElementChild.children[0].lastElementChild.lastElementChild.children[0].children[0]
                    // before we can logActivity, we have to                                          ^^ wait for this to be created (loading)      ^^ then wait for this to be created
                    // nested MutationObserver. TODO: make function for all the mutation observers so code is smaller and easier to read.
                    var observer = new MutationObserver(function (mutations) {
                        mutations.forEach(function (mutation) {
                            if (mutation.addedNodes[0]) {
                                var observer = new MutationObserver(function (mutations) {
                                    mutations.forEach(function (mutation) {
                                        if (mutation.addedNodes[0]) {
                                            logActivity(mutation.addedNodes[0].children[0].children[0])
                                        }
                                    });
                                });
                                observer.observe(mutation.addedNodes[0].children[0].lastElementChild, {childList: true});
                            }
                        });
                    });
                    observer.observe(document.getElementsByClassName('coreSpriteDesktopNavActivity')[0].parentNode, {childList: true});
                }
            }
            catch(e){ // not expected to happen
                console.log('unexpected' + e)
            }
            finally{
            }
        }

        function storyMode(){
            function logStoriesStoryMode(){
                return {'timestamp': Math.floor(Date.parse(document.getElementsByTagName('time')[0].attributes.datetime.value) / 1000),
                        'username': document.getElementsByTagName('a')[0].href.split('/').slice(-2)[0]}
            }
            var observer = new MutationObserver(function (mutations) {
                mutations.forEach(function (mutation) {
                    if (mutation.type == 'childList' && mutation.addedNodes[0]) {
                        if (document.URL.split('/')[3] == 'stories' && document.getElementsByTagName('a')[0].href == document.getElementsByTagName('a')[1].href){ // accidental story logging seems too easy so here just in case
                            logData('stories', logStoriesStoryMode())
                        }
                    }
                });
            });
            observer.observe(document.getElementById('react-root').children[0].children[0].children[0], {attributes: true, childList: true, characterData: true});
            logData('stories', logStoriesStoryMode())
        }

        function activityMode(){
            try{
                logActivity(document.getElementsByTagName('main')[0].children[0].children[0].children[0].children[0])
            }
            catch(e){
                setTimeout(activityMode, 1000) // TODO: mutationobserver for this.
            }
            finally{}
        }

        function chooseMode(){
            if (window.location.href == 'https://www.instagram.com/')
                homeMode()
            else if (window.location.pathname.split('/')[1] == 'stories')
                storyMode()
            else if (document.documentElement.classList.contains('touch') && window.location.pathname == '/accounts/activity/') // Desktop activity is in everythingMode
                activityMode();
        }

        /* Detect major page change */ {
            var observer = new MutationObserver(function (mutations) {
                chooseMode()
            });
            observer.observe(document.getElementById('react-root'), {childList: true});
        }

        chooseMode()

    }, false);
}

/* indexedDB to JSON download */ function exportData(storeNames) {
    var request = indexedDB.open('InstagramLog', 1);

    request.onsuccess = function (event) {
        var db = event.target.result;
        var data = {};
        var tx = db.transaction(db.objectStoreNames, 'readonly');
        storeNames.forEach(function(storeName) { // use forEach or forleti=0 because openCursor().onsuccess is asynchronous
            if (db.objectStoreNames.contains(storeName)){
                data[storeName] = [];
                var store = tx.objectStore(storeName);

                store.openCursor().onsuccess = function (event) {
                    console.log(storeName);

                    var cursor = event.target.result;
                    if (cursor && JSON.stringify(data).length < (1e6 * document.getElementById('inputFileSizeLimit').value)) { // modular is kill here // questioning efficiency of this. Maybe it's better to limit entries instead of file size.
                        // TODO: range/constraint on cursor
                        // TODO: export to CSV option because it takes less memory and space
                        data[storeName].push(cursor.value);
                        cursor.continue();
                    }
                };
            }
        })
        tx.onerror = function () {
            console.log('tx.onerror')
            db.close();
        }
        tx.oncomplete = function () {
            // Export data
            var blob = new Blob([JSON.stringify(data)], {type: 'octet/stream'});
            var url = window.URL.createObjectURL(blob);
            // Create download link
            document.getElementById('download').href = url; // modular is kill here too
            var fileext;
            if(document.getElementById('formFileType').elements[1].checked) { // modular is kill because I reference elem here
                fileext = 'json'
            } else {
                fileext = 'csv'
            }
            document.getElementById('download').innerText = document.getElementById('download').download = document.getElementById('inputFilename').value + '.' + fileext; // maybe innerText should be 'Click to Download' instead.
            db.close();
        };
    };

}

/* creating GUI for exporting data */ {
    var fab = document.createElement('div'); // this isn't really a floating action button is it?
    fab.style = 'z-index:9;position:fixed;top:0;right:50%;height:44px;width:44px;background-color:black;color:white;text-align:center;line-height:normal;font-size:30px;cursor:pointer'
    fab.innerHTML = '&darr;'
    document.body.insertBefore(fab, document.body.firstChild); // if I change innerHTML to outerHTML and do inserBefore before that line it only has 1 element, but onclick doesn't work.
    fab.onclick = function(){
        /* show/hide overlay thing */
        if (!document.getElementById('overlayStuff')){
            var overlayStuff = document.createElement('div')
            overlayStuff.id="overlayStuff"
            overlayStuff.style="z-index:9;position:fixed;background-color:white"
            overlayStuff.innerHTML = '<table style="width: 100%;">\n<tbody>\n<tr>\n<td><strong>File Name:</strong></td>\n<td><input id="inputFilename" value="data" type="text" /></td>\n</tr>\n<tr>\n<td><strong>Stuff to Save:</strong></td>\n<td><form id="formStuffSave">\n  <input value="posts"  type="checkbox" checked="checked"/>Posts<br/>\n  <input value="stories" type="checkbox" checked="checked" />Stories<br/>\n  <input value="activity" type="checkbox" checked="checked"/>Activity<br/>\n</form></td>\n</tr>\n<tr>\n<td><strong>Save as type:</strong></td>\n<td><form id="formFileType">\n  <input value="CSV - Comma Seperated Values" type="radio" disabled="disabled" />CSV - Comma Seperated Values<br /> <!-- this one should be default checed becaues it takes less memory -->\n  <input value="JSON - JavaScript Object Notation" checked="checked" type="radio" />JSON - JavaScript Object Notation\n</form></td>\n</tr>\n<tr>\n<td><strong>File Size Limit (MB):</strong></td>\n<td><input id="inputFileSizeLimit" value="50" min="1" type="number" /></td>\n</tr>\n</tbody>\n</table>\n<button id="buttonGenerateExport" type="button">Generate File to Download</button> <a id="download"></a>'
            //        document.body.appendChild(overlayStuff); // this is same but bottom
            document.body.insertBefore(overlayStuff, document.body.firstChild);
            document.getElementById('buttonGenerateExport').onclick = function(){
                var storeNames = [];
                for (var i=0;i<document.getElementById('formStuffSave').elements.length;i++){
                    if (document.getElementById('formStuffSave').elements[i].checked){
                        storeNames.push(document.getElementById('formStuffSave').elements[i].value)
                    }
                }
                exportData(storeNames)
            }
            fab.innerHTML = '&uarr;'
        }
        else {
            document.getElementById('overlayStuff').remove()
            fab.innerHTML = '&darr;'
        }
    }
}

// TODO: ctrl+f 'modular', fix functions...referenced elements as params...element changes as return and instead something outside the function changes the graphics.
// FYI: page does not reload you go to different places.
// another page TODO: log /p/...
// another page TODO: log https://www.instagram.com/accounts/activity/ (works only for mobile right now)
// another page TODO: log https://www.instagram.com/[username]

