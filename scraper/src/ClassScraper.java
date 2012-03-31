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

		int termIndex = -1;
		if (args.length != 1)
			error = true;
		else {
			String term = args[0];

			for (int i = 0; i < Utils.TERMS.length; i++) {
				if (term.toUpperCase().equals(Utils.TERMS[i].toUpperCase())
						|| term.toUpperCase().equals(
								Utils.TERMS_STRINGS[i].toUpperCase())) {
					termIndex = i;
					break;
				}
			}
			if (termIndex == -1) {
				error = true;
			}
		}

		if (error) {
			StringBuilder msg = new StringBuilder();
			msg.append("Error. This program expects 1 argument. The argument can be:");
			for (String s : Utils.TERMS_STRINGS) {
				msg.append(" ");
				msg.append(s);
				msg.append(",");
			}
			msg.deleteCharAt(msg.length() - 1);
			System.err.println(msg.toString());
			System.exit(1);
		}

		String terms = getTerm(termIndex);
		if (terms == null) {
			System.err.println("An error has occurred.");
			System.exit(1);
		}

		System.out.println(terms);
	}

	public static String getTerm(int termIndex) {
		boolean connected = Utils.connect();

		if (!connected) {
			System.err.println("Unable to connect to Redis server.");
			return null;
		}

		if (termIndex >= 0 && termIndex < Utils.TERMS_STRINGS.length) {
			System.err.println(String.format(
					"Connected to Redis server. Parsing term %s...",
					Utils.TERMS_STRINGS[termIndex]));

			TermModel term = parseTerm(termIndex);
			Gson gson = new Gson();

			String result = gson.toJson(term);

			Utils.disconnect();

			return result;
		} else {
			return null;
		}
	}

	private static TermModel parseTerm(int termIndex) {
		try {
			String term = Utils.TERMS[termIndex];
			String url = String.format(URL, URLEncoder.encode(term, "UTF-8"));

			Document doc = Jsoup.connect(url).get();

			Element row = doc.select("input[name=p_list_all] + FONT").first();
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
			for (int j = 0; j + 2 < numRows; j += 3) {
				if (j + 3 > numRows) {
					System.err.println("break");
				}
				String department = Utils.trim(classRows.get(j + 0).text());
				String number = Utils.trim(classRows.get(j + 1).text());
				String title = Utils.trim(classRows.get(j + 2).text());

				float percent = 0;
				percent = (float) j / numRows * 100;
				String percentString = String.format("%.1f%%", percent);

				if (!percentString.equals(previousPercentString)) {
					System.err.println(percentString);
					previousPercentString = percentString;
				}

				try {
					ClassModel classModel = DetailsScraper.getClassModel(term,
							department, number, title);

					retry = 0;
					classModels.add(classModel);
					Utils.save(classModel);
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
			TermModel termModel = new TermModel(Utils.TERMS_STRINGS[termIndex],
					year, updated, classModels.toArray(new ClassModel[] {}));
			return termModel;
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
}
