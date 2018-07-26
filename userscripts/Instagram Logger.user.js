// ==UserScript==
// @name         Instagram Logger
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Log stuff on the instagram homepage. It will only log what you see.
// @author       William Situ
// @match        https://www.instagram.com/
// @grant        none
// ==/UserScript==

// Only mutation observers need to stay in the event listener
window.addEventListener('load', function() {
    if (document.documentElement.classList.contains('logged-in')){
        /* Posts Logging*/
        function parsePost(articElem){
            return {'shortcode': articElem.getElementsByTagName('a')[articElem.getElementsByTagName('a').length-1].href.split('/').slice(-2)[0],
                    'timestamp': Math.floor(Date.parse(articElem.getElementsByTagName('time') [0].attributes.datetime.value) / 1000), // Instagram uses unix epoch time so I will too.
                    'username': articElem.getElementsByTagName('a')[0].href.split('/').slice(-2)[0]} // normally second <a> is username, but when there's a story first <a> is username. URL works either way.
        }
        function logPosts(){
            var posts_list;
            if (document.documentElement.classList.contains('touch')){
                posts_list = document.getElementsByTagName('main')[0].children[0].lastElementChild.children[0].children[0];
            }
            else{
                posts_list = document.getElementsByTagName('main')[0].children[0].children[0].children[0].children[0];
            }
            var posts_observer = new MutationObserver(function (mutations) {
                mutations.forEach(function (mutation) {
                    if (mutation.type == 'childList' && mutation.addedNodes[0]) {
                        logData('posts', parsePost(mutation.addedNodes[0]));
                    }
                });
            });

            for (var i=0;i<posts_list.children.length;i++){
                logData('posts', parsePost(posts_list.children[i]));
            }
            posts_observer.observe(posts_list, {attributes: true, childList: true, characterData: true});
        }
        try{
            logPosts()
        }
        catch(TypeError){ // This is not expected to happen
            console.log('unexpected' + TypeError)
        }
        finally{
        }

        /* Story Logging */
        function parseStory(divElem){
            return {'timestamp': Math.floor(Date.parse(divElem.getElementsByTagName('time')[0].attributes.datetime.value) / 1000),
                    'username': divElem.getElementsByTagName('span')[1].innerText}
        }
        function logStories(){
            if (!document.documentElement.classList.contains('touch')){ // only do desktop b/c they don't timestamp on mobile

                var stories_list = document.getElementsByTagName('main')[0].children[0].lastElementChild.children[3].children[0].children[0]
                //  var stories_list = document.getElementsByTagName('main')[0].children[0].children[0].lastElementChild.children[0].children[0] // mobile (has no timestamps without opening story)
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
        }
        try{
            logStories()
        }
        catch(TypeError){ // on desktop web, stories don't show if window width too small.
            setTimeout(logStories, 30000)
        }
        finally{
        }

        /* Activity Logging */ // TODO: activities logging
        function parseActivity(){}
        function logActivities(){}
        try{
            logActivities()
        }
        catch(TypeError){
            console.log(TypeError)
        }
        finally{
        }

    }
}, false);

/* check support for indexedDB */ if (!window.indexedDB) {
    window.alert('No support for IndexedDB');
}

// JSDoc only really needed for 2+ params
/**
 * Data to indexedDB
 * @param {String} storeName - name of object store in indexedDB to log it in
 * @param {JSON} item - JSON object to log
 */
function logData(storeName, item){
    var request = indexedDB.open('InstagramLog', 1); // starts from 1

    request.onerror = function(event) {
        alert("Why didn't you allow me to use IndexedDB?!");
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
        var tx = db.transaction(storeName, "readwrite"); // ['posts', 'stories'] also works here
        var store = tx.objectStore(storeName);

        //console.log(JSON.stringify(item))
        store.add(item) // no need to overwrite so I use add() instead of put()

        tx.onerror = function(){
            console.log('tx.onerror') // I wonder if I should handle duplicate entry myself instead of pushing it to error
            db.close();
        }
        tx.oncomplete = function() {
            console.log('tx.oncomplete')
            db.close();
        };
    };
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

                store.openCursor().onsuccess = function (event) { // this function looks like it happens inside the loop, but it doesn't (i is 2) (because asyncronous)
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
    fab.innerHTML = '<div style="z-index:9;position:fixed;top:0;right:50%;height:44px;width:44px;background-color:black;color:white;text-align:center;line-height:normal;font-size:30px;cursor:pointer">&darr;</div>'; // im guessing no should have div in innerHTML (is only solution to do assignments) // i fix l8r
    document.body.insertBefore(fab, document.body.firstChild); // if I change innerHTML to outerHTML and do inserBefore before that line it only has 1 element, but onclick doesn't work.
    fab.onclick = function(){
        /* show overlay thing */
        if (!document.getElementById('overlayStuff')){
            var overlayStuff = document.createElement('div')
            overlayStuff.innerHTML = '<div id="overlayStuff" style="z-index:9;position:fixed;background-color:white" >\n<table style="width: 100%;">\n<tbody>\n<tr>\n<td><strong>File Name:</strong></td>\n<td><input id="inputFilename" value="data" type="text" /></td>\n</tr>\n<tr>\n<td><strong>Stuff to Save:</strong></td>\n<td><form id="formStuffSave">\n  <input value="posts"  type="checkbox" checked="checked"/>Posts<br/>\n  <input value="stories" type="checkbox" checked="checked" />Stories<br/>\n  <input value="activity" type="checkbox" checked="checked"/>Activity<br/>\n</form></td>\n</tr>\n<tr>\n<td><strong>Save as type:</strong></td>\n<td><form id="formFileType">\n  <input value="CSV - Comma Seperated Values" type="radio" disabled="disabled" />CSV - Comma Seperated Values<br /> <!-- this one should be default checed becaues it takes less memory -->\n  <input value="JSON - JavaScript Object Notation" checked="checked" type="radio" />JSON - JavaScript Object Notation\n</form></td>\n</tr>\n<tr>\n<td><strong>File Size Limit (MB):</strong></td>\n<td><input id="inputFileSizeLimit" value="50" min="1" type="number" /></td>\n</tr>\n</tbody>\n</table>\n<button id="buttonGenerateExport" type="button">Generate File to Download</button> <a id="download"></a>\n</div>'
            //        document.body.appendChild(overlayStuff, document.body);
            document.body.insertBefore(overlayStuff, document.body.firstChild); // why does this one work but appendchild not???
            // Make button functional
            document.getElementById('buttonGenerateExport').onclick = function(){
                var storeNames = [];
                for (var i=0;i<document.getElementById('formStuffSave').elements.length;i++){
                    if (document.getElementById('formStuffSave').elements[i].checked){
                        storeNames.push(document.getElementById('formStuffSave').elements[i].value)
                    }
                }
                exportData(storeNames)
            }
            // Change arrow after creating
            fab.innerHTML = fab.innerHTML.replace('↓','↑') // innerText not work
        }
        /* But if it exists remove overlay thing */
        else {
            document.getElementById('overlayStuff').remove()
            // Change arrow after removing
            fab.innerHTML = fab.innerHTML.replace('↑','↓') // should i use escape unicode \u instead? Also was going to use x instead of ↑ but it replaces other x's

        }
    }
}

// TODO: ctrl+f 'modular', fix functions...referenced elements as params...element changes as return and instead something outside the function changes the graphics.
// TODO: log stories when opened, especially for mobile and since stories only latest
// TODO: log activity when opened (click on heart symbol)

// another page TODO: log /p/...
// another page TODO: log https://www.instagram.com/accounts/activity/
// another page TODO: log https://www.instagram.com/[username]
// another page TODO: log https://www.instagram.com/stories/[user] (should be same as log stories when opened)