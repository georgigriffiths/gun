/**
 * AXE test 1
 * What we want here: (1) Superpeer and (n) peers
 *  - The peers receives only the requested data.
 *  - If the Superpeer crash, after restart, must recreate all subscriptions and update the peers.
 *  - If some peer crash or go offline, must receive the changes via RTC.
 *
 * Tip: to run this `npm run testaxe`
 * Tip 2: if you clone the gun repo, you need to create a link do gun package. Do `npm install && cd node_modules && ln -s ../ gun`
 * Tip 3: If you not in localhost, run the browsers in anonymous mode because of domain security policies. https://superuser.com/questions/565409/how-to-stop-an-automatic-redirect-from-http-to-https-in-chrome
 */
var selenium = require('selenium-webdriver')
var config = {
	IP: require('ip').address(),
	port: 8765,
	servers: 2,
	browsers: 2,
	route: {
		'/': __dirname + '/index.html',
		'/gun.js': __dirname + '/../../gun.js',
		'/gun/axe.js': __dirname + '/../../axe.js',
		'/gun/lib/radix.js': __dirname + '/../../lib/radix.js',
		'/gun/lib/webrtc.js': __dirname + '/../../lib/webrtc.js',
		'/jquery.js': __dirname + '/../../examples/jquery.js'
	}
}

var panic = require('panic-server');
panic.server().on('request', function(req, res){
	config.route[req.url] && require('fs').createReadStream(config.route[req.url]).pipe(res);
}).listen(config.port);

var clients = panic.clients;
var manager = require('panic-manager')();
manager.start({
    clients: Array(config.servers).fill().map(function(u, i){
			return {
				type: 'node',
				port: config.port + (i + 1)
			}
		}),
		panic: 'http://' + config.IP + ':' + config.port
});

var servers = clients.filter('Node.js');
var server = servers.pluck(1);
var server2 = servers.excluding(server).pluck(1);
var browsers = clients.excluding(servers);
var alice = browsers.pluck(1);
var bob = browsers.excluding(alice).pluck(1);
var john = browsers.excluding(alice).excluding(bob).pluck(1);
var again = {};
var drivers = []

describe("The Holy Grail AXE Test!", function(){

	this.timeout(5 * 60 * 1000);
// 	this.timeout(10 * 60 * 1000);
	before(function () {
		for(var i=0;  i<config.browsers;i++) {
			drivers[i] = new selenium.Builder()
			.withCapabilities(selenium.Capabilities.chrome())
			.build()
		};
	})
	it("Servers have joined!", function(){
		return servers.atLeast(config.servers);
	});

	it("GUN started!", function(){
		return server.run(function(test){
			var env = test.props;
			test.async();
			try{ require('fs-extra').removeSync(env.i+'dataaxe') }catch(e){}
			try{ require('fs-extra').removeSync((env.i+1)+'dataaxe') }catch(e){}
			var port = env.config.port + env.i;
			var server = require('http').createServer(function(req, res){
				res.end("I am "+ env.i +"!");
			});
			var Gun = require('../../../');
			//require('../../../axe');
			var gun = Gun({
				file: env.i+'dataaxe',
				web: server
			});
			server.listen(port, function(){
				test.done();
			});
		}, {i: 1, config: config});
	});

	it(config.browsers +" browser(s) have joined!", function(){
		for(var i=0;  i<config.browsers;i++) {
			drivers[i].get('http://'+ config.IP +":"+ config.port)
		};
		//console.log("PLEASE OPEN http://"+ config.IP +":"+ config.port +" IN "+ config.browsers +" BROWSER(S)!");
		return browsers.atLeast(config.browsers);
	});

	it("Browsers initialized gun!", function(){
		var tests = [], i = 0;
		browsers.each(function(client, id){
			tests.push(client.run(function(test){
				localStorage.clear(); console.log('Clear localStorage!!!');
				var env = test.props;
				var opt = {peers:['http://'+ env.config.IP + ':' + (env.config.port + 1) + '/gun']};
				var pid = location.hash.slice(1);
				if (pid) { opt.pid = pid; }
				Gun.on('opt', function(ctx) {
					this.to.next(ctx);
					ctx.on('hi', function(opt) {
						document.getElementById('pid').innerHTML = (document.getElementById('pid').innerHTML || "-")  + ', ' + this.on.opt.pid;
					});
				});
				var gun = window.gun = Gun(opt);
				window.ref = gun.get('holy').get('grail');
			}, {i: i += 1, config: config}));
		});
		return Promise.all(tests);
	});

	it("Wait for Alice, Bob and John...", function(done){
		setTimeout(done, 1000);
	});


	it("Bob receive object from Alice", function(){
		return Promise.all([bob.run(function(test){
			console.log('bob listen room')
			test.async();
			var room = gun.get('room')
			var recieve_count = 0
			setTimeout(function () {
				room.get('users').map().off()
				recieve_count === 1 ? test.done() : test.fail('Recieved '+recieve_count + ' times')
			}, 5000)

				room.get('users').map().on(function(data){
					if('testid' === data.id){
						console.log('[OK] Bob receive the room object: ', data);
						return recieve_count++
					} else {
						var err = '[FAIL] Bob MUST receive: Hi Bob! but receive: ' + data + ' Storage: ' + localStorage.getItem('gun/');
						console.log(err);
						return test.fail(err);
					}
				})

			
		}),alice.run(function(test){
			test.async();
			console.log('alice send room')
			var room = gun.get('room') 

				room.get('users').map().on(function(data) {
					console.log('alice map on',data)
					room.get('users').map().off()
					test.done()
						// TODO: Need `.once` first for subscription. If Alice do a `.put` before a `.once`, Alice will get old data from localStorage if Bob update
				});
				setTimeout(function () {
					room.get('users').get('testid').put({id:'testid'});
				}, 1000);
				

		})])
	});

	

	it("Bob receive object from Alice second time", function(){
		return Promise.all([bob.run(function(test){
			console.log('bob listen room')
			$('#name').text('Bob');
			test.async();
			var room = gun.get('room')
			var receive_count = 0
			setTimeout(function () {
				room.get('users2').map().off()
				receive_count === 3 ? test.done() : test.fail('Received '+receive_count + ' times')
			}, 10000)

			room.get('users2').map().on(function(data){
				console.log(JSON.stringify(data))
				if('testid' === data.id && receive_count === 1 && data.data === 'test'){
					console.log('[OK] Bob receive the room object: ', data);
					return receive_count++
				} else if('testid' === data.id && receive_count === 2 && data.data === 'test2'){
					console.log('[OK] Bob receive the room object: ', data);
					return receive_count++
				} else if('testid' === data.id && receive_count === 0 && data.data === undefined){
					console.log('[OK] Bob receive the room object: ', data);
					return receive_count++
				} else {
					var err = '[FAIL] Bob MUST receive correct data: ' + data.data + ' Storage: ' + localStorage.getItem('gun/');
					console.log(err);
					return test.fail(err);
				}
			})

			
		}),alice.run(function(test){
			test.async();
			$('#name').text('Alice');
			console.log('alice send room')
			var room = gun.get('room') 

			room.get('users2').map().on(function(data) {
				console.log('alice map on',data)
			});
			setTimeout(function () {
				room.get('users2').get('testid').put({id:'testid'});
			}, 1000);
			setTimeout(function () {
				room.get('users2').get('testid').put({id:'testid', data:'test'});
			}, 2000);

			setTimeout(function () {
				room.get('users2').get('testid').put({id:'testid', data:'test2'});
				room.get('users2').map().off()
				test.done()
			}, 3000);

		})])
	});


	it("Bob receive object from Alice third time", function(){
		return Promise.all([bob.run(function(test){
			console.log('bob listen room')
			$('#name').text('Bob');
			test.async();
			var room = gun.get('room')
			var receive_count = 0
			setTimeout(function () {
				room.get('users3').map().off()
				receive_count === 3 ? test.done() : test.fail('Received '+receive_count + ' times' + ' Storage: ' + localStorage.getItem('gun/'))
			}, 10000)

			room.get('users3').map().on(function(data){
				console.log(JSON.stringify(data))
				if('testid' === data.id && receive_count === 1 && data.data === 'test'){
					console.log('[OK] Bob receive the room object: ', data);
					return receive_count++
				} else if('testid' === data.id && receive_count === 2 && data.data === 'test2'){
					console.log('[OK] Bob receive the room object: ', data);
					return receive_count++
				} else if('testid' === data.id && receive_count === 0 && data.data === undefined){
					console.log('[OK] Bob receive the room object: ', data);
					return receive_count++
				} else {
					var err = '[FAIL] Bob MUST receive correct data: ' + data.data + ' Storage: ' + localStorage.getItem('gun/');
					console.log(err);
					return test.fail(err);
				}
			})

			
		}),alice.run(function(test){
			test.async();
			$('#name').text('Alice');
			console.log('alice send room')
			var room = gun.get('room') 

			room.get('users3').map().on(function(data) {
				console.log('alice map on',data)
			});
			setTimeout(function () {
				room.get('users3').get('testid').get('id').put('testid');
			}, 1000);
			setTimeout(function () {
				room.get('users3').get('testid').get('data').put('test');
			}, 2000);

			setTimeout(function () {
				room.get('users3').get('testid').get('data').put('test2');
				room.get('users3').map().off()
				test.done()
			}, 3000);

		})])
	});




	it("All finished!", function(done){
		console.log("Done! Cleaning things up...");
		setTimeout(function(){
			done();
		},1000);
	});
	after("Everything shut down.", function(){
		// for(var i=0; i<config.browsers; i++) {
		// 	drivers[i].quit()
		// };

		servers.run(function(){
			process.exit();
		});

	});
});
