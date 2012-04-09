import java.io.IOException;
import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;
import java.util.ArrayList;

import model.ClassModel;
import model.ClassModel.Schedule;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;

import util.Utils;

public class DetailsScraper {
	private static final String URL = "http://osoc.berkeley.edu/OSOC/osoc?y=0&p_term=%s&p_deptname=--+Choose+a+Department+Name+--&p_classif=--+Choose+a+Course+Classification+--&p_course=%s&p_dept=%s&x=0";

	// connect to osoc.berkeley.edu to scrape class details
	public static ClassModel getClassModel(String term, String department,
			String course, String title) throws IOException {
		try {

			String url = String.format(URL, URLEncoder.encode(term, "UTF-8"),
					URLEncoder.encode(course, "UTF-8"),
					URLEncoder.encode(department, "UTF-8"));

			Document doc = Jsoup.connect(url).get();

			Elements rows = doc.select("TABLE[BORDER=0]")
					.select("TABLE[CELLSPACING=2]")
					.select("TABLE[CELLPADDING=0]");

			ClassModel classModel = new ClassModel(term, department, course,
					title, new ArrayList<Schedule>());

			for (int i = 0; i < rows.size() - 2; i++) {
				Element element = rows.get(i + 1); // skip first and last
				Elements data = element.select("tt");

				String[] daysTimeAndLocation = Utils.trim(data.get(1).text())
						.split("[,(]");

				String daysTime = Utils.trim(daysTimeAndLocation[0]);

				if (daysTime.equals("CANCELLED") || daysTime.equals("TBA")
						|| daysTime.equals("UNSCHED OFF CAMPUS")
						|| daysTimeAndLocation.length < 2)
					continue; // don't put this class in the db

				String location = Utils.trim(daysTimeAndLocation[1]);

				if (location.equals("") || location.equals("OFF CAMPUS")
						|| location.equals("NO FACILITY"))
					continue; // don't put this class in the db

				String[] daysTimeSplit = daysTime.split(" ");
				String days = daysTimeSplit[0];
				String time = daysTimeSplit[1];

				String[] locationSplit = location.split(" ", 2);

				String buildingNumber = "";
				String building = locationSplit[0];

				// lots of exceptions to take care of
				if (location.equals("PAC FILM ARC")
						|| location.equals("BOT GARDEN")
						|| location.equals("SPIEKER POOL")
						|| location.equals("HEARST POOL")
						|| location.equals("KERR FIELD")
						|| location.equals("RSF FLDHOUSE")
						|| location.equals("DURHAM THTRE")) {
					building = location;
				} else if (location.equals("WHEELER AUD")
						|| location.equals("BECHTEL AUD")) {
					buildingNumber = locationSplit[1];
					building = locationSplit[0];
				} else if (locationSplit.length > 1) {
					buildingNumber = locationSplit[0];
					building = locationSplit[1];

					char[] numberChars = buildingNumber.toCharArray();
					boolean foundNumber = false;
					for (char c : numberChars) {
						if (c >= '0' && c <= '9') {
							foundNumber = true;
							break;
						}
					}

					if (!foundNumber) {
						System.err.println(location);
					}
				}

				classModel.schedules.add(new Schedule(days, time, building,
						buildingNumber));
			}

			return classModel;
		} catch (UnsupportedEncodingException e) {
			throw e;
		} catch (IOException e) {
			throw e;
		}
	}
}
