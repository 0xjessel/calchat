import java.io.IOException;
import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;

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
	private static final String[] TERMS = { "SP", "SU", "FL" };
	private static final String[] TERMS_STRINGS = { "spring", "summer", "fall" };

	public static void main(String args[]) {
		System.out.println(getTerms());
	}

	public static String getTerms() {
		TermModel[] terms = parseTerms();
		Gson gson = new Gson();
		return gson.toJson(terms);
	}

	private static TermModel[] parseTerms() {
		try {
			TermModel[] terms = new TermModel[TERMS.length];

			for (int i = 0; i < TERMS.length; i++) {
				String url = String.format(URL,
						URLEncoder.encode(TERMS[i], "UTF-8"));

				Document doc = Jsoup.connect(url).get();

				Element row = doc.select("input[name=p_list_all] + FONT")
						.first();
				String data = row.text();
				String[] dataPieces = data.split("[, ]");
				String updated = Utils.trim(dataPieces[0]);
				String year = Utils.trim(dataPieces[dataPieces.length - 1]);

				Elements classRows = doc
						.select("label[class=buttonlink b listbtn]");

				ClassModel[] classModels = new ClassModel[classRows.size() / 3];

				for (int j = 0; j < classRows.size(); j += 3) {
					String department = Utils.trim(classRows.get(j + 0).text());
					String number = Utils.trim(classRows.get(j + 1).text());
					String title = Utils.trim(classRows.get(j + 2).text());
					ClassModel classModel = new ClassModel(department, number,
							title);
					classModels[j / 3] = classModel;
				}

				TermModel term = new TermModel(TERMS_STRINGS[i], year, updated,
						classModels);
				terms[i] = term;
			}
			return terms;
		} catch (UnsupportedEncodingException e) {
			e.printStackTrace();
			return null;
		} catch (IOException e) {
			e.printStackTrace();
			return null;
		}
	}
}
