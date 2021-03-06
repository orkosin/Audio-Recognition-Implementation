let recognizer;
let examples = [];
let model;

var loadModel = true;

const FRAMES = 3;  //One frame is ~23ms of Audio
const INPUT_SHAPE = [FRAMES, 232, 1];

//Called by buttons from index.html
function collect(label) {
  if (label == null) {
    return recognizer.stopListening();
  }
  recognizer.listen(async ({spectrogram: {frameSize, data}}) => {
    let vals = normalize(data.subarray(-frameSize * FRAMES));
    examples.push({vals, label});
    //console.log(examples);
    document.querySelector('#console').textContent = `${examples.length} examples collected`;
  }, {
    overlapFactor: 0.999,
    includeSpectrogram: true,
    invokeCallbackOnNoiseAndUnknown: true
  });
}

function normalize(x) {
  const mean = -100;
  const std = 10;
  return x.map(x => (x - mean) / std);
}

async function train() {
  toggleButtons(false);
  if (examples.length == 0) {
    loadModel = false;
    alert("No data was collected. Loading pre-trained model...");
  } else {
    const ys = tf.oneHot(examples.map(e => e.label), 3);
    const xsShape = [examples.length, ...INPUT_SHAPE];
    const xs = tf.tensor(flatten(examples.map(e => e.vals)), xsShape);

    await model.fit(xs, ys, {
      batchSize: 16,
      epochs: 10,
      callbacks: {
        onEpochEnd: (epoch, logs) => {
          document.querySelector('#console').textContent =
            `Accuracy: ${(logs.acc * 100).toFixed(1)}% Epoch: ${epoch + 1}`;
        }
      }
    });
    tf.dispose([xs, ys]);
  }
  toggleButtons(true);
}

function buildModel() {
  model = tf.sequential();
  model.add(tf.layers.depthwiseConv2d({
    depthMultiplier: 8,
    kernelSize: [FRAMES, 3],
    activation: 'relu',
    inputShape: INPUT_SHAPE
  }));
  model.add(tf.layers.maxPooling2d({poolSize: [1, 2], strides: [2, 2]}));
  model.add(tf.layers.flatten());
  model.add(tf.layers.dense({units: 3, activation: 'softmax'}));
  const optimizer = tf.train.adam(0.01);
  model.compile({
    optimizer,
    loss: 'categoricalCrossentropy',
    metrics: ['accuracy']
  });
}

function toggleButtons(enable) {
  document.querySelectorAll('button').forEach(b => b.disabled = !enable);
}

function flatten(tensors) {
  const size = tensors[0].length;
  const result = new Float32Array(tensors.length * size);
  tensors.forEach((arr, i) => result.set(arr, i * size));
  return result;
}

async function moveSlider(labelTensor) {
  const label = (await labelTensor.data())[0];
  var word = "";
  if (label == 0) {
    word = "left";
  } else if (label == 1) {
    word = "right";
  } else if (label == 2) {
    return;
  }
  document.getElementById('console').textContent = "Prediction: " + word;
  let delta = 0.1;
  const prevValue = +document.getElementById('output').value;
  document.getElementById('output').value =
  prevValue + (label === 0 ? -delta : delta);
}

function listen() {
  if (recognizer.isListening()) {
    recognizer.stopListening();
    toggleButtons(true);
    document.getElementById('listen').textContent = 'Listen';
    return;
  }
  toggleButtons(false);
  document.getElementById('listen').textContent = 'Stop';
  document.getElementById('listen').disabled = false;

  if (loadModel) {
    recognizer.listen(async ({spectrogram: {frameSize, data}}) => {
      const vals = normalize(data.subarray(-frameSize * FRAMES));
      const input = tf.tensor(vals, [1, ...INPUT_SHAPE]);
      const probs = model.predict(input);
      const predLabel = probs.argMax(1);
      await moveSlider(predLabel);
      tf.dispose([input, probs, predLabel]);
    }, {
      overlapFactor: 0.999,
      includeSpectrogram: true,
      invokeCallbackOnNoiseAndUnknown: true
    });
  } else {
    //Array of words that the recognizer is trained to recognize
    const words = recognizer.wordLabels();
    recognizer.listen(({scores}) => {
    //Turn scores into a list of (score, word) pairs
    scores = Array.from(scores).map((s, i) => ({score: s, word: words[i]}));
    //Find the most probable words
    scores.sort((s1, s2) => s2.score - s1.score);
    document.querySelector('#console').textContent = "Prediction: " + scores[0].word;
    let delta = 0.1;
    const prevValue = +document.getElementById('output').value;
    if (scores[0].word === "left") {
       document.getElementById('output').value =  prevValue - delta; 
    } else if (scores[0].word === "right") {
       document.getElementById('output').value = prevValue + delta;
    }
    }, {probabilityThreshold: 0.75});
  }
}

/*
function predictWord() {
//Array of words that the recognizer is trained to recognize
const words = recognizer.wordLabels();
recognizer.listen(({scores}) => {
//Turn scores into a list of (score, word) pairs
scores = Array.from(scores).map((s, i) => ({score: s, word: words[i]}));
//Find the most probable words
scores.sort((s1, s2) => s2.score - s1.score);
document.querySelector('#console').textContent = scores[0].word;
}, {probabilityThreshold: 0.75});
}
*/

async function app() {
  recognizer = speechCommands.create('BROWSER_FFT');
  await recognizer.ensureModelLoaded();
  //predictWord();
  buildModel();
}

app();
