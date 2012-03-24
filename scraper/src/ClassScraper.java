import java.io.IOException;
import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;
import java.util.ArrayList;

import model.ClassModel;
import model.TermModel;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;

import util.Utils;

import com.google.gson.Gson;

public class ClassScraper {
	private static final String URL = "http://osoc.berkeley.edu/OSOC/osoc?p_term=%s&p_list_all=Y";
	private static final int RETRY_LIMIT = 3;

	public static void main(String args[]) {
		boolean error = false;

		String terms = null;
		if (args.length == 1) {
			String term = args[0];
			boolean found = false;
			for (int i = 0; i < Utils.TERMS.length; i++) {
				if (term.toUpperCase().equals(Utils.TERMS[i].toUpperCase())
						|| term.toUpperCase().equals(
								Utils.TERMS_STRINGS[i].toUpperCase())) {
					// Get terms
					terms = getTerms(i);
					found = true;
					break;
				}
			}
			if (!found) {
				error = true;
			}
		} else if (args.length == 0) {
			// Get terms
			terms = getTerms(-1);
		} else {
			error = true;
		}

		if (error) {
			StringBuilder msg = new StringBuilder();
			msg.append("Error. This program expects 0 or 1 arguments. Provide an argument if you want a particular semester. The argument can be:");
			for (String s : Utils.TERMS_STRINGS) {
				msg.append(" ");
				msg.append(s);
				msg.append(",");
			}
			msg.deleteCharAt(msg.length() - 1);
			System.err.println(msg.toString());
			System.exit(1);
		}

		if (terms == null) {
			System.err.println("An error has occurred.");
			System.exit(1);
		}

		System.out.println(terms);
	}

	public static String getTerms(int termIndex) {
		boolean connected = Utils.connect();

		if (!connected) {
			System.err.println("Unable to connect to Redis server.");
			return null;
		}

		if (termIndex == -1)
			System.err.println("Connected to Redis server. Parsing...");
		else
			System.err.println(String.format(
					"Connected to Redis server. Parsing term %s...",
					Utils.TERMS_STRINGS[termIndex]));

		TermModel[] terms = parseTerms(termIndex);
		Gson gson = new Gson();

		String result = null;
		if (termIndex == -1)
			result = gson.toJson(terms);
		else
			result = gson.toJson(terms[termIndex]);

		Utils.saveLocations();

		Utils.disconnect();

		return result;
	}

	private static TermModel[] parseTerms(int termIndex) {
		TermModel[] terms = new TermModel[Utils.TERMS.length];

		for (int i = 0; i < Utils.TERMS.length; i++) {
			if (termIndex != -1 && termIndex != i)
				continue; // skip this term if we specified another term

			try {
				String url = String.format(URL,
						URLEncoder.encode(Utils.TERMS[i], "UTF-8"));

				Document doc = Jsoup.connect(url).get();

				Element row = doc.select("input[name=p_list_all] + FONT")
						.first();
				String data = row.text();
				String[] dataPieces = data.split("[, ]");
				String updated = Utils.trim(dataPieces[0]);
				String year = Utils.trim(dataPieces[dataPieces.length - 1]);

				Elements classRows = doc
						.select("label[class=buttonlink b listbtn]");

				ArrayList<ClassModel> classModels = new ArrayList<ClassModel>();

				String previousPercentString = null;
				int retry = 0;

				int numRows = classRows.size();
				for (int j = 0; j < numRows; j += 3) {
					String department = Utils.trim(classRows.get(j + 0).text());
					String number = Utils.trim(classRows.get(j + 1).text());

					float percent = 0;
					if (termIndex == -1) {
						percent = (float) (i * numRows + j)
								/ (Utils.TERMS.length * numRows) * 100;
					} else {
						percent = (float) j / numRows * 100;
					}
					String percentString = String.format("%.1f%%", percent);

					if (!percentString.equals(previousPercentString)) {
						System.err.println(percentString);
						previousPercentString = percentString;
					}

					try {
						ArrayList<ClassModel> newClassModels = DetailsScraper
								.getClassModel(Utils.TERMS[i], department,
										number);

						retry = 0;
						classModels.addAll(newClassModels);
					} catch (IOException e) {
						if (retry < RETRY_LIMIT) {
							j--; // retry
							retry++;
							System.err
									.println("Encountered a problem with your internet. Retrying...");
							continue;
						} else {
							throw e;
						}
					}
				}
				TermModel term = new TermModel(Utils.TERMS_STRINGS[i], year,
						updated, classModels.toArray(new ClassModel[] {}));
				terms[i] = term;
			} catch (UnsupportedEncodingException e) {
				e.printStackTrace();
				return null;
			} catch (IOException e) {
				e.printStackTrace();
				System.err
						.println("Encountered unrecoverable error. Check your internet connection.");
				return null;
			}
		}
		return terms;
	}
}
