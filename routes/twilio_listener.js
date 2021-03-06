const express = require('express');
const http = require('https');
const VoiceResponse = require('twilio').twiml.VoiceResponse;
const urlencoded = require('body-parser').urlencoded;
const util = require('util');
const {transcribe} = require('../services/speechtext');
const {insert,list} = require('../services/cloudant');
const nlu = require('../services/nlu');

const transcribeAsync = util.promisify(transcribe);

// socket.io instance passed in
function initialize(sio) {
  const router = express.Router();

  router.use(urlencoded({extended: false}));

  router.post('/dial', function(req, res) {
    const twiml = new VoiceResponse();
    const dial = twiml.dial({
        record: 'record-from-answer',
        recordingStatusCallback: '/dialHandle',
        trim: 'trim-silence'
    });
    dial.number('301-337-7475');

    console.log(twiml.toString());

    console.log(JSON.stringify(req.body));
    res.type('text/xml');
    res.send(twiml.toString());
  });

  router.post('/dialHandle', function(req, res) {
    console.log(JSON.stringify(req.body));
    const recording = req.body.RecordingUrl + '.mp3';
    const rqstParams = {
      content_type: 'audio/mp3',
      keywords: ["Car bomb" ,"Jihad" , "Taliban","Weapons cache",
      "Suicide bomber", "Suicide attack", "Suspicious substance", "AQAP", "AQIM",
      "TTP", "Yemen", "Pirates", "Extremism", "Somalia", "Nigeria", "Radicals",
      "Al-Shabaab", "Home grown", "annihilate", "death"]
    };

    http.get(recording, function(response) {
      transcribeAsync(response, rqstParams)
      .then((transcript) => {
        nlu(transcript, (err, analysis) => {
          return insert(Object.assign({}, req.body, {
            text: transcript.toString('utf8'),
            analysis: !err ? analysis : null
          }))
          .then(() => res.send('ok'))
          .catch((e) => {
            console.error(e);
            return res.status(500).send('Error transcribing recording!');
          });
        });
      })
    }).on('error', function(e) {
      console.error(e);
      return res.status(500).send('Error downloading recording!');
    });
  });

  router.post('/record', function(req, res) {
    const twiml = new VoiceResponse();
    twiml.say('hello. please leave a message after the beep. press the star key when finished.');

    twiml.record({
    	timeout: 5,
        transcribe: false,
        recordingStatusCallback: '/handleRecording',
        maxLength: 20,
        finishOnKey: "*"
    });

    twiml.hangup();

      res.type('text/xml');
      console.log(twiml.toString());
      //console.log(util.inspect(req));
      res.send(twiml.toString());
  });

  router.post('/handleRecording', function(req, res) {
    var body = req.body;
    console.log(util.inspect(body));
    if (body.RecordingStatus !== "completed") {
      console.log(`Not completed, was ${body.RecordingStatus}; ignoring...`);
      return res.send("OK");
    }

    let recording = body.RecordingUrl + '.mp3';
    let rqstParams = {
      content_type: 'audio/mp3'
      //, keywords: ['colorado', 'tornado', 'tornadoes']
    };
    let request = http.get(recording, function(response) {
      transcribe(response, rqstParams, (err, transcript) => {
        if(err) {
          console.error(err.stack)
          return res.status(500).send('Error transcribing recording!');
        }

        console.log('transcript completed: ' + transcript.toString('utf8'));
        sio.sockets.emit('call', {
          id: body.CallSid,
          recordingID: body.RecordingSid,
          recordingURL: body.RecordingUrl,
          recordingDuration: body.RecordingDuration,
          transcript: transcript.toString('utf8')
        });
      });
    });

    return res.send("OK");
  });

  // Create a route that will handle Twilio webhook requests, sent as an
  // HTTP POST to /voice in our application
  router.post('/voice', function(req, res) {
    // Get information about the incoming call, like the city associated
    // with the phone number (if Twilio can discover it)
    const city = req.body.FromCity;

    // Use the Twilio Node.js SDK to build an XML response
    const twiml = new VoiceResponse();
    twiml.say({voice: 'alice'},
      `Never gonna give you up ${city}.`
    );
    twiml.play({}, 'https://demo.twilio.com/docs/classic.mp3');

    // Render the response as XML in reply to the webhook request
    res.type('text/xml');
    res.send(twiml.toString());
  });

    //return router;
  // Create a route that will handle Twilio webhook requests, sent as an
  // HTTP POST to /voice in our application
  router.post('/voice', function(req, res) {
    // Get information about the incoming call, like the city associated
    // with the phone number (if Twilio can discover it)
    const city = req.body.FromCity;

    // Use the Twilio Node.js SDK to build an XML response
    const twiml = new VoiceResponse();
    twiml.say({voice: 'alice'},
      `Never gonna give you up ${city}.`
    );
    twiml.play({}, 'https://demo.twilio.com/docs/classic.mp3');

    // Render the response as XML in reply to the webhook request
    res.type('text/xml');
    res.send(twiml.toString());
  });

  return router;
}

module.exports = initialize;
