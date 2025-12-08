#include <essentia/algorithmfactory.h>
#include <essentia/essentiamath.h>
#include <essentia/essentia.h>
#include <essentia/pool.h>
#include <iostream>
#include <filesystem>
#include <cstdlib>

using namespace std;
using namespace essentia;
using namespace standard;
namespace fs = std::filesystem;

int main(int argc, char* argv[]) {
	if (argc < 3) {
		cerr << "Usage: " << argv[0] << " input.wav output_dir" << endl;
		return 1;
	}

	essentia::init();

	string inputFile = argv[1];
	fs::path outDir = argv[2];
	fs::create_directories(outDir);

	AlgorithmFactory& factory = standard::AlgorithmFactory::instance();

	// Chargement audio
	Algorithm* loader = factory.create("MonoLoader",
		"filename", inputFile,
		"sampleRate", 44100.0);
	vector<Real> audio;
	loader->output("audio").set(audio);
	loader->compute();

	// Détection des attaques
	Algorithm* onsetDet = factory.create("OnsetDetection", "method", "complex");
	Algorithm* frameCutter = factory.create("FrameCutter",
		"frameSize", 2048,
		"hopSize", 512,
		"silentFrames", "drop");
	Algorithm* window = factory.create("Windowing", "type", "hann");
	Algorithm* fft = factory.create("FFT");
	Algorithm* c2p = factory.create("CartesianToPolar");
	Algorithm* onset = factory.create("Onsets");

	vector<Real> frame, windowedFrame, mag, phase, onsetDetOut;
	vector<Real> onsetTimes;

	frameCutter->input("signal").set(audio);
	frameCutter->output("frame").set(frame);
	onset->input("onsetDetections").set(onsetDetOut);
	onset->output("onsets").set(onsetTimes);

	while (true) {
		frameCutter->compute();
		if (frame.empty()) break;
		window->input("frame").set(frame);
		window->output("frame").set(windowedFrame);
		window->compute();
		fft->input("frame").set(windowedFrame);
		fft->output("fft").set(mag);
		fft->compute();
		c2p->input("complex").set(mag);
		c2p->output("magnitude").set(mag);
		c2p->output("phase").set(phase);
		c2p->compute();
		onsetDet->input("magnitude").set(mag);
		onsetDet->input("phase").set(phase);
		onsetDet->output("onsetDetection").set(onsetDetOut);
		onsetDet->compute();
	}

	onset->compute();

	// Affichage et découpe via FFmpeg
	cout << "→ " << onsetTimes.size() << " coups détectés" << endl;
	for (size_t i = 0; i < onsetTimes.size(); ++i) {
		double start = onsetTimes[i];
		double end = (i + 1 < onsetTimes.size()) ? onsetTimes[i + 1] - 0.05 : start + 1.0;
		char outName[512];
		snprintf(outName, sizeof(outName), "%s/hit_%03zu.wav", outDir.c_str(), i + 1);
		string cmd = "ffmpeg -v error -y -i \"" + inputFile +
					 "\" -ss " + to_string(start) + " -to " + to_string(end) +
					 " -c copy \"" + string(outName) + "\"";
		system(cmd.c_str());
	}

	delete loader;
	delete onsetDet;
	delete frameCutter;
	delete window;
	delete fft;
	delete c2p;
	delete onset;

	essentia::shutdown();
	return 0;
}